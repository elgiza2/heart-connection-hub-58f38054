/** @doc Profile editor — full name, nickname, AI instructions. Autosaves. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Camera, Loader2, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import { useIsMobile } from "@/hooks/use-mobile";
import { SubShell, SubSection, SubCard, DangerCallout } from "@/components/settings/SubShell";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

const ProfileEditPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [instructions, setInstructions] = useState("");

  const savedRef = useRef({ fullName: "", nickname: "", instructions: "" });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Load data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      setEmail(user.email ?? "");
      setAvatarUrl(user.user_metadata?.avatar_url ?? null);

      const [profileRes, persRes] = await Promise.all([
        supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("ai_personalization").select("call_name, custom_instructions").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;

      if ((profileRes.data as any)?.avatar_url) setAvatarUrl((profileRes.data as any).avatar_url);

      const initialFull =
        (profileRes.data as any)?.display_name ||
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "";
      const initialNick = (persRes.data as any)?.call_name || initialFull;
      const initialInstr = (persRes.data as any)?.custom_instructions || "";

      setFullName(initialFull);
      setNickname(initialNick);
      setInstructions(initialInstr);
      savedRef.current = {
        fullName: initialFull,
        nickname: initialNick,
        instructions: initialInstr,
      };
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced autosave
  useEffect(() => {
    if (loading || !userId) return;
    const dirtyName = fullName.trim() !== savedRef.current.fullName.trim();
    const dirtyNick = nickname !== savedRef.current.nickname;
    const dirtyInstr = instructions !== savedRef.current.instructions;
    if (!dirtyName && !dirtyNick && !dirtyInstr) return;

    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const tasks: Promise<any>[] = [];
        if (dirtyName && fullName.trim()) {
          tasks.push(
            Promise.resolve(
              supabase.rpc("update_profile_safe", {
                p_user_id: userId,
                p_display_name: fullName.trim(),
              }),
            ),
          );
          tasks.push(supabase.auth.updateUser({ data: { full_name: fullName.trim() } }));
        }
        if (dirtyNick || dirtyInstr) {
          tasks.push(
            Promise.resolve(
              supabase.from("ai_personalization").upsert(
                {
                  user_id: userId,
                  call_name: nickname.trim() || null,
                  custom_instructions: instructions.trim() || null,
                },
                { onConflict: "user_id" },
              ),
            ),
          );
        }
        const results = await Promise.all(tasks);
        const err = results.find((r: any) => r?.error)?.error;
        if (err) throw err;

        savedRef.current = { fullName, nickname, instructions };
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1400);
      } catch (err: any) {
        setSaveState("idle");
        toast.error(sanitizeErrorMessage(err, "Failed to save"));
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [fullName, nickname, instructions, loading, userId]);

  const goBack = () => navigate("/settings");

  const pickAvatar = () => fileRef.current?.click();

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image is too large (max 5MB)");
      return;
    }
    setAvatarBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${userId}/avatars/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("user-images")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("user-images").getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error("Could not resolve image URL");

      const [profRes, authRes] = await Promise.all([
        supabase.from("profiles").update({ avatar_url: url }).eq("id", userId),
        supabase.auth.updateUser({ data: { avatar_url: url } }),
      ]);
      if ((profRes as any)?.error) throw (profRes as any).error;
      if ((authRes as any)?.error) throw (authRes as any).error;

      setAvatarUrl(url);
      toast.success("Profile photo updated");
    } catch (err: any) {
      toast.error(sanitizeErrorMessage(err, "Failed to update photo"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  };

  const openDelete = () => setConfirmOpen(true);
  const confirmDelete = () => {
    setConfirmOpen(false);
    navigate("/settings/delete-account");
  };

  const statusIcon =
    saveState === "saving" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
    ) : saveState === "saved" ? (
      <Check className="w-3.5 h-3.5" />
    ) : null;

  // ============================== MOBILE ==============================
  if (isMobile) {
    const initial = (nickname || fullName || email || "U").trim().charAt(0).toUpperCase();
    return (
      <div className="pep-root">
        <style>{pepCss}</style>

        {/* Topbar */}
        <header className="pep-topbar">
          <button className="pep-icon-btn" aria-label="Back" onClick={goBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="pep-title">Account</h1>
          <span className="pep-icon-btn" aria-live="polite">{statusIcon}</span>
        </header>

        <section className="pep-main">
          <div className="pep-avatar-wrap">
            <button
              type="button"
              className="pep-avatar-btn"
              onClick={pickAvatar}
              disabled={avatarBusy}
              aria-label="Change profile photo"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="pep-avatar-img" />
              ) : (
                <span className="pep-avatar">{initial}</span>
              )}
              <span className="pep-avatar-badge">
                {avatarBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </span>
            </button>
            <p className="pep-avatar-hint">{avatarBusy ? "Uploading…" : "Tap to change photo"}</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleAvatarFile}
          />

          <section className="pep-card">
            <div className="pep-row">
              <label htmlFor="pep-full" className="pep-row-label">Name</label>
              <input
                id="pep-full"
                className="pep-row-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
            <div className="pep-divider" />
            <div className="pep-row">
              <span className="pep-row-label">Email</span>
              <span className="pep-row-value">{email || "—"}</span>
            </div>
            <div className="pep-divider" />
            <div className="pep-row">
              <span className="pep-row-label">User ID</span>
              <span className="pep-row-value pep-row-value-mono">{userId ?? "—"}</span>
            </div>
          </section>

          <button className="pep-flat" type="button" onClick={() => setLogoutOpen(true)}>
            Log out
          </button>

          <button className="pep-flat pep-flat-danger" onClick={openDelete} type="button">
            Delete account
          </button>

          <div className="pep-spacer" />
        </section>

        <ConfirmDialog
          open={confirmOpen}
          tone="danger"
          title="Delete account"
          description="This permanently removes your account, chats and files. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmOpen(false)}
        />

        <ConfirmDialog
          open={logoutOpen}
          title="Log out"
          description="You'll need to sign in again to access your chats."
          confirmLabel="Log out"
          loading={loggingOut}
          icon={<LogOut size={20} strokeWidth={1.8} />}
          onConfirm={handleLogout}
          onCancel={() => setLogoutOpen(false)}
        />

      </div>
    );
  }


  // ============================== DESKTOP ==============================
  return (
    <SubShell
      title="Profile"
      subtitle="Changes are saved automatically."
      backTo="/settings"
      action={
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {saveState === "saving" && (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>)}
          {saveState === "saved" && (<><Check className="w-3.5 h-3.5 text-primary" /> Saved</>)}
        </span>
      }
    >
      <SubSection title="Photo" description="Shown across Megsy.">
        <SubCard>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={pickAvatar}
              disabled={avatarBusy}
              className="relative w-16 h-16 rounded-full overflow-hidden border border-border/70 bg-muted grid place-items-center text-[22px] font-medium text-foreground"
              aria-label="Change profile photo"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                (nickname || fullName || email || "U").trim().charAt(0).toUpperCase()
              )}
              {avatarBusy && (
                <span className="absolute inset-0 grid place-items-center bg-background/60">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </span>
              )}
            </button>
            <div>
              <button
                type="button"
                onClick={pickAvatar}
                disabled={avatarBusy}
                className="px-3.5 py-2 rounded-lg text-[13px] font-medium bg-background/60 border border-border/70 hover:border-foreground/40 transition-colors inline-flex items-center gap-2"
              >
                <Camera className="w-3.5 h-3.5" /> Upload photo
              </button>
              <p className="mt-2 text-[12px] text-muted-foreground">PNG or JPG, up to 5MB.</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
        </SubCard>
      </SubSection>

      <SubSection title="Names" description="How Megsy addresses you.">
        <SubCard>
          <div className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Full name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="mt-2 w-full px-3.5 py-2.5 rounded-lg bg-background/60 border border-border/70 text-[14px] text-foreground outline-none focus:border-foreground/40 transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Nickname
              </label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Nickname"
                className="mt-2 w-full px-3.5 py-2.5 rounded-lg bg-background/60 border border-border/70 text-[14px] text-foreground outline-none focus:border-foreground/40 transition-colors"
              />
              <p className="mt-2 text-[12px] text-muted-foreground">
                Megsy calls you by your nickname in chat.
              </p>
            </div>
          </div>
        </SubCard>
      </SubSection>

      <SubSection title="Instructions" description="Custom guidance applied to every conversation.">
        <SubCard>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="How you'd like Megsy to respond"
            rows={5}
            className="w-full px-3.5 py-2.5 rounded-lg bg-background/60 border border-border/70 text-[14px] text-foreground outline-none focus:border-foreground/40 transition-colors resize-y"
          />
        </SubCard>
      </SubSection>

      <SubSection title="Danger zone" description="Irreversible actions.">
        <DangerCallout
          title="Delete account"
          description="Permanently remove your account and all associated data."
          action={
            <button
              onClick={openDelete}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-colors"
            >
              Delete account
            </button>
          }
        />
      </SubSection>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        title="Delete account"
        description="This permanently removes your account, chats and files. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        open={logoutOpen}
        title="Log out"
        description="You'll need to sign in again to access your chats."
        confirmLabel="Log out"
        loading={loggingOut}
        icon={<LogOut size={20} strokeWidth={1.8} />}
        onConfirm={handleLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </SubShell>
  );
};

const pepCss = `
.pep-root {
  min-height: 100dvh;
  background: var(--mn-bg);
  color: var(--mn-fg);
  font-family: "Neue Haas Unica", "Helvetica Now Display", -apple-system, "SF Pro Display", Inter, "Segoe UI", Roboto, sans-serif;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.pep-topbar {
  position: sticky; top: 0; z-index: 5;
  display: grid; grid-template-columns: 38px 1fr 38px;
  align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px 10px;
  background: var(--mn-bg);
}
.pep-title {
  margin: 0;
  text-align: center;
  font-size: 16px; font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--mn-fg);
}
.pep-icon-btn {
  width: 34px; height: 34px;
  display: inline-grid; place-items: center;
  border-radius: 999px;
  background: transparent;
  border: 0;
  color: var(--mn-fg);
  cursor: pointer;
  transition: transform 160ms ease;
}
.pep-icon-btn:active { transform: scale(0.94); }

.pep-main { padding: 6px 14px 20px; }
.pep-avatar-wrap { display: grid; place-items: center; gap: 8px; padding: 20px 0 18px; }
.pep-avatar {
  width: 74px; height: 74px; border-radius: 999px;
  display: grid; place-items: center;
  background: var(--mn-avatar); color: #fff;
  font-size: 30px; font-weight: 500; line-height: 1;
}
.pep-avatar-hint { margin: 0; font-size: 12.5px; color: var(--mn-muted); }
.pep-avatar-btn {
  position: relative; padding: 0; border: 0; background: transparent;
  width: 74px; height: 74px; border-radius: 999px; cursor: pointer;
  transition: transform 160ms ease;
}
.pep-avatar-btn:active { transform: scale(0.96); }
.pep-avatar-btn:disabled { opacity: 0.7; }
.pep-avatar-img { width: 74px; height: 74px; border-radius: 999px; object-fit: cover; display: block; }
.pep-avatar-badge {
  position: absolute; right: -2px; bottom: -2px;
  width: 26px; height: 26px; border-radius: 999px;
  display: grid; place-items: center;
  background: var(--mn-fg); color: var(--mn-bg);
  border: 2px solid var(--mn-bg);
}
.pep-row-value { flex: 1; text-align: end; font-size: 14px; color: var(--mn-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pep-row-value-mono { font-variant-numeric: tabular-nums; }
.pep-flat {
  margin-top: 16px; width: 100%;
  padding: 14px 16px; border: 0; border-radius: 14px;
  background: var(--mn-card); color: var(--mn-fg);
  font: inherit; font-size: 14px; font-weight: 500;
  cursor: pointer; text-align: center;
  transition: transform 160ms ease;
}
.pep-flat:active { transform: scale(0.99); }
.pep-flat-danger { color: var(--mn-danger); }
.pep-section-title {
  margin: 18px 4px 8px;
  font-size: 12px; font-weight: 500;
  color: var(--mn-muted);
  letter-spacing: -0.005em;
}

.pep-card {
  background: var(--mn-card);
  border: 0;
  border-radius: 14px;
  overflow: hidden;
}
.pep-card-tight { padding: 4px; }


.pep-row {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 15px;
  min-height: 48px;
}
.pep-row-label {
  font-size: 14px; font-weight: 400;
  color: var(--mn-muted);
  flex-shrink: 0;
}
.pep-root .pep-row-input {
  flex: 1;
  background-color: var(--mn-card) !important;
  background-image: none !important;
  border: 0 !important; outline: none;
  color: var(--mn-fg) !important;
  font: inherit;
  font-size: 14px; font-weight: 500;
  text-align: end;
  min-width: 0;
  -webkit-appearance: none;
  appearance: none;
  color-scheme: dark;
  box-shadow: none !important;
  caret-color: var(--mn-fg);
}
.pep-root .pep-row-input::placeholder { color: var(--mn-faint) !important; }
.pep-root .pep-row-input:-webkit-autofill,
.pep-root .pep-row-input:-webkit-autofill:hover,
.pep-root .pep-row-input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 1000px var(--mn-card) inset;
  -webkit-text-fill-color: var(--mn-fg);
  caret-color: var(--mn-fg);
}
.pep-divider {
  height: 1px;
  background: var(--mn-sep);
  margin-left: 15px;
}
.pep-hint {
  margin: 8px 6px 0;
  font-size: 12px;
  color: rgba(232,232,232,0.5);
  line-height: 1.45;
}

/* Scope under .pep-root so these rules beat the mobile theme's global
   body.ms-theme textarea selector and keep the textarea the same dark
   surface as the card. */
.pep-root .pep-textarea {
  width: 100%;
  min-height: 80px;
  background-color: var(--mn-card) !important;
  background-image: none !important;
  border: 0; outline: none;
  padding: 12px 14px;
  color: var(--mn-fg);
  font: inherit;
  font-size: 14px; font-weight: 400;
  resize: none;
  -webkit-appearance: none;
  appearance: none;
  color-scheme: dark;
  box-shadow: none;
}
.pep-root .pep-textarea::placeholder { color: var(--mn-muted); }
.pep-root .pep-textarea:-webkit-autofill,
.pep-root .pep-textarea:-webkit-autofill:hover,
.pep-root .pep-textarea:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 1000px var(--mn-card) inset;
  -webkit-text-fill-color: var(--mn-fg);
  caret-color: var(--mn-fg);
}

.pep-danger {
  margin-top: 18px;
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  padding: 13px 15px;
  background: rgba(255,90,90,0.06);
  border: 1px solid rgba(255,90,90,0.12);
  border-radius: 14px;
  color: var(--mn-danger);
  font: inherit;
  font-size: 14px; font-weight: 500;
  cursor: pointer;
  transition: transform 160ms ease, background-color 160ms ease;
}
.pep-danger:active { transform: scale(0.99); background: rgba(255,90,90,0.10); }

.pep-spacer { height: 28px; }

/* Confirm modal */
.pep-modal-scrim {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  display: grid; place-items: center;
  padding: 20px;
  animation: pep-fade 200ms ease-out both;
}
.pep-modal {
  width: 100%; max-width: 300px;
  background: var(--mn-card);
  border: 0;
  border-radius: 18px;
  padding: 18px 18px 12px;
  box-shadow: 0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 var(--mn-sep);
  animation: pep-pop 220ms cubic-bezier(0.16,1,0.3,1) both;
}
.pep-modal-title {
  margin: 0 0 5px;
  font-size: 16px; font-weight: 600;
  color: var(--mn-fg);
}
.pep-modal-body {
  margin: 0 0 16px;
  font-size: 13.5px; line-height: 1.4;
  color: var(--mn-muted);
}
.pep-modal-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.pep-modal-btn {
  padding: 10px;
  border-radius: 12px;
  background: var(--mn-card-2);
  border: 0;
  color: var(--mn-fg);
  font: inherit;
  font-size: 13.5px; font-weight: 500;
  cursor: pointer;
  transition: transform 160ms ease, background-color 160ms ease;
}
.pep-modal-btn:active { transform: scale(0.97); }
.pep-modal-btn-danger {
  color: var(--mn-danger);
  background: rgba(255,90,90,0.08);
  border-color: rgba(255,90,90,0.16);
}

@keyframes pep-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pep-pop {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}
`;

export default ProfileEditPage;
