/** @doc Knowledge — user knowledge entries list + add sheet (mobile-first, flat dark design). */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Lightbulb, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { goBackOr } from "@/lib/navigation";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";

type KnowledgeRow = {
  id: string;
  name: string;
  use_when: string;
  content: string;
  enabled: boolean;
  created_at: string;
};

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const KnowledgePage = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [useWhen, setUseWhen] = useState("");
  const [content, setContent] = useState("");

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_knowledge")
      .select("id,name,use_when,content,enabled,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    setRows((data as unknown as KnowledgeRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openSheet = () => {
    setName("");
    setUseWhen("");
    setContent("");
    setSheetOpen(true);
  };

  const save = async () => {
    if (!useWhen.trim() || !content.trim()) {
      toast.error("Please fill in the required fields");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("no user");
      const { error } = await supabase.from("user_knowledge").insert({
        user_id: uid,
        name: name.trim().slice(0, 120),
        use_when: useWhen.trim().slice(0, 500),
        content: content.trim().slice(0, 5000),
      });
      if (error) throw error;
      setSheetOpen(false);
      await load();
      notifyTurnContextChanged();
    } catch {
      toast.error("Could not save knowledge");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row: KnowledgeRow) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: !r.enabled } : r)));
    const { error } = await supabase
      .from("user_knowledge")
      .update({ enabled: !row.enabled })
      .eq("id", row.id);
    if (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: row.enabled } : r)));
      return;
    }
    notifyTurnContextChanged();
  };

  return (
    <div className="kn-root" dir="ltr">
      <style>{knCss}</style>

      <header className="kn-topbar">
        <button className="kn-icon-btn" aria-label="Back" onClick={() => goBackOr(navigate, "/settings")}>
          <ChevronLeft className="w-5 h-5" strokeWidth={2} />
        </button>
        <h1 className="kn-title">Knowledge</h1>
        <button className="kn-icon-btn" aria-label="Add knowledge" onClick={openSheet}>
          <Plus className="w-5 h-5" strokeWidth={2} />
        </button>
      </header>

      <section className="kn-main">
        {loading ? (
          <div className="kn-state">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="kn-empty">
            <Lightbulb className="kn-empty-icon" strokeWidth={1.4} />
            <p className="kn-empty-text">No knowledge yet</p>
            <button className="kn-cta" onClick={openSheet}>
              <Plus className="w-4 h-4" strokeWidth={2.2} />
              Add now
            </button>
          </div>
        ) : (
          <ul className="kn-list">
            {rows.map((r, i) => (
              <li key={r.id} className="kn-card" style={{ animationDelay: `${i * 40}ms` }}>
                <p className="kn-card-name">{r.name || "Untitled"}</p>
                <p className="kn-card-when">{r.use_when}</p>
                <div className="kn-card-foot">
                  <button
                    className={`kn-status ${r.enabled ? "is-on" : ""}`}
                    onClick={() => toggle(r)}
                  >
                    <span className="kn-dot" />
                    {r.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <span className="kn-time">{timeLabel(r.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheetOpen && (
        <div className="kn-sheet-wrap">
          <div className="kn-scrim" onClick={() => setSheetOpen(false)} />
          <div className="kn-sheet" aria-label="Add knowledge">
            <header className="kn-sheet-top">
              <button className="kn-icon-btn" aria-label="Close" onClick={() => setSheetOpen(false)}>
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
              <h2 className="kn-sheet-title">Add knowledge</h2>
              <button className="kn-save" onClick={save} disabled={saving}>
                {saving ? "Saving" : "Save"}
              </button>
            </header>

            <div className="kn-fields">
              <label className="kn-label" htmlFor="kn-name">Name</label>
              <input
                id="kn-name"
                className="kn-input"
                placeholder="Knowledge name"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <label className="kn-label" htmlFor="kn-when">
                Use when <span className="kn-req">*</span>
              </label>
              <textarea
                id="kn-when"
                className="kn-input kn-area"
                placeholder="When should this knowledge be used"
                maxLength={500}
                value={useWhen}
                onChange={(e) => setUseWhen(e.target.value)}
              />

              <label className="kn-label" htmlFor="kn-content">
                Content <span className="kn-req">*</span>
              </label>
              <textarea
                id="kn-content"
                className="kn-input kn-area kn-area-lg"
                placeholder="Knowledge content"
                maxLength={5000}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const knCss = `
.kn-root {
  min-height: 100dvh;
  background: var(--mn-bg);
  color: var(--mn-fg);
  font-family: "Neue Haas Unica", "Helvetica Now Display", -apple-system, "SF Pro Display", Inter, "Segoe UI", Roboto, sans-serif;
}
.kn-topbar {
  position: sticky; top: 0; z-index: 5;
  display: grid; grid-template-columns: 34px 1fr 34px; align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px;
  background: var(--mn-bg);
}
.kn-title { margin: 0; text-align: center; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.kn-icon-btn {
  width: 34px; height: 34px; display: inline-grid; place-items: center;
  border: 0; background: transparent; color: var(--mn-fg); border-radius: 999px;
  cursor: pointer; transition: transform 160ms ease;
}
.kn-icon-btn:active { transform: scale(0.94); }

.kn-main { padding: 6px 14px 28px; }
.kn-state { display: grid; place-items: center; padding: 68px 0; color: hsl(var(--foreground) / 0.6); }

.kn-empty {
  display: grid; justify-items: center; gap: 12px;
  padding: 32dvh 16px 0;
  animation: kn-rise 320ms cubic-bezier(0.16,1,0.3,1) both;
}
.kn-empty-icon { width: 38px; height: 38px; color: var(--mn-muted); }
.kn-empty-text { margin: 0; font-size: 13.5px; color: hsl(var(--foreground) / 0.6); }
.kn-cta {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 10px 17px; border: 0; border-radius: 12px;
  background: var(--mn-cta-bg); color: var(--mn-cta-fg);
  font: inherit; font-size: 13.5px; font-weight: 600;
  cursor: pointer; transition: transform 160ms ease, opacity 160ms ease;
}
.kn-cta:active { transform: scale(0.97); opacity: 0.9; }

.kn-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.kn-card {
  background: var(--mn-card); border-radius: 14px; padding: 12px 14px 6px;
  animation: kn-rise 320ms cubic-bezier(0.16,1,0.3,1) both;
}
.kn-card-name { margin: 0 0 5px; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.kn-card-when { margin: 0 0 10px; font-size: 12.5px; line-height: 1.5; color: hsl(var(--foreground) / 0.6); }
.kn-card-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0 6px; border-top: 1px solid var(--mn-sep);
}
.kn-status {
  display: inline-flex; align-items: center; gap: 6px;
  border: 0; background: transparent; padding: 0;
  font: inherit; font-size: 12.5px; color: var(--mn-muted); cursor: pointer;
}
.kn-status.is-on { color: var(--mn-accent); }
.kn-dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.kn-time { font-size: 12.5px; color: hsl(var(--foreground) / 0.6); }

.kn-sheet-wrap {
  position: fixed; inset: 0; z-index: 60;
  background: transparent; border: 0; padding: 0;
}
.kn-scrim {
  position: absolute; inset: 0;
  background: hsl(var(--background) / 0.18);
  animation: kn-fade 200ms ease both;
}
.kn-sheet {
  position: absolute; inset: 13dvh 0 0;
  background: var(--mn-sheet);
  border: 0 !important; border-radius: 22px 22px 0 0; overflow-y: auto;
  box-shadow: 0 -16px 34px hsl(var(--background) / 0.32);
  animation: kn-up 300ms cubic-bezier(0.16,1,0.3,1) both;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
}
.kn-sheet-top {
  position: sticky; top: 0; z-index: 2; background: var(--mn-sheet);
  display: grid; grid-template-columns: 34px 1fr auto; align-items: center;
  padding: 14px 12px 10px;
}
.kn-sheet .kn-icon-btn {
  background: transparent !important;
  color: var(--mn-fg) !important;
  border: 0 !important;
  box-shadow: none !important;
}
.kn-sheet-title { margin: 0; text-align: center; font-size: 15.5px; font-weight: 600; }
.kn-save {
  border: 0; background: transparent; color: var(--mn-fg);
  font: inherit; font-size: 14px; font-weight: 600; padding: 7px 9px; cursor: pointer;
}
.kn-save:disabled { opacity: 0.5; }

.kn-fields { padding: 4px 16px 0; display: grid; gap: 6px; }
.kn-label {
  margin-top: 12px; font-size: 13px; font-weight: 500;
  color: hsl(var(--foreground) / 0.85);
}
.kn-req { color: var(--mn-danger); }
.kn-input {
  width: 100%; box-sizing: border-box;
  background: var(--mn-input) !important;
  border: 0 !important;
  border-radius: 13px;
  padding: 11px 13px !important; color: var(--mn-fg); font-family: inherit;
  font-size: 14.5px !important;
  line-height: 1.4;
  outline: none !important; box-shadow: none !important;
  appearance: none; transition: background 160ms ease, box-shadow 160ms ease;
}
.kn-input::placeholder { color: hsl(var(--foreground) / 0.6); font-size: 14.5px; }
.kn-input:focus {
  background: var(--mn-card-2) !important;
  box-shadow: inset 0 0 0 1px hsl(var(--foreground) / 0.1) !important;
}
.kn-area { min-height: 64px; resize: none; }
.kn-area-lg { min-height: 88px; }

@keyframes kn-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes kn-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes kn-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
`;

export default KnowledgePage;
