/** @doc Official skills library — browse and add curated skills. */
import { useState } from "react";
import { Search, Check, Plus, Loader2, ShieldCheck } from "lucide-react";
import { resolveSkillIcon, skillEmoji } from "@/lib/skillIcon";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSkills, type Skill } from "@/hooks/useSkills";
import { getActiveWorkspaceId } from "@/lib/activeWorkspace";
import { SubShell } from "@/components/settings/SubShell";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";

export default function SkillsLibraryPage() {
  const { mySkills, librarySkills, loading, reload } = useSkills();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (s: Skill) => {
    setBusy(s.id);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(null);
      toast.error("Sign in required");
      return;
    }
    const { error } = await supabase.from("skills").insert({
      user_id: user.id,
      workspace_id: getActiveWorkspaceId(),
      name: s.name,
      description: s.description,
      instructions: s.instructions,
      body: s.body || s.instructions,
      triggers: s.triggers || [],
      enabled_tools: s.enabled_tools || [],
      preferred_model: s.preferred_model,
      icon: s.icon,
      is_enabled: true,
    });
    setBusy(null);
    if (error) {
      toast.error(sanitizeErrorMessage(error, "Something went wrong"));
      return;
    }
    toast.success(`Added "${s.name}"`);
    reload();
  };

  const q = query.trim().toLowerCase();
  const items = librarySkills.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.description || "").toLowerCase().includes(q),
  );

  return (
    <SubShell
      title="Official library"
      subtitle="Ready-made skills maintained by Megsy."
      backTo="/settings/skills"
    >
      <div className="flex items-center gap-2 h-11 px-4 rounded-[14px] bg-[var(--mn-card)]">
        <Search className="w-4 h-4 text-[color:var(--mn-muted)] shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search library"
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-[color:var(--mn-fg)] placeholder:text-[color:var(--mn-muted)]"
        />
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[74px] rounded-[14px] bg-[var(--mn-card)] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-14 px-6 rounded-[14px] bg-[var(--mn-card)]">
          <div className="mx-auto w-11 h-11 rounded-full bg-[color:var(--mn-sep)] grid place-items-center mb-3">
            <Search className="w-5 h-5 text-[color:var(--mn-muted)]" />
          </div>
          <p className="text-[15px] font-semibold text-[color:var(--mn-fg)]">No skills found</p>
          <p className="text-[12.5px] mt-1.5 text-[color:var(--mn-muted)]">Try a different search.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((s) => {
            const installed = mySkills.some((m) => m.name === s.name);
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 px-4 py-3.5 rounded-[14px] bg-[var(--mn-card)]"
              >
                <LibraryIcon name={s.name} icon={s.icon} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-[color:var(--mn-fg)] truncate">
                    {s.name}
                  </p>
                  {s.description && (
                    <p className="mt-0.5 text-[12.5px] leading-snug text-[color:var(--mn-muted)] line-clamp-2">
                      {s.description}
                    </p>
                  )}
                </div>
                {installed ? (
                  <span className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12px] font-semibold text-primary bg-primary/10">
                    <Check className="w-3.5 h-3.5" strokeWidth={2.6} /> Added
                  </span>
                ) : (
                  <button
                    aria-label={`Add ${s.name}`}
                    disabled={busy === s.id}
                    onClick={() => add(s)}
                    className="shrink-0 h-8 px-3.5 rounded-full grid place-items-center bg-[color:var(--mn-sep)] text-[color:var(--mn-fg)] hover:opacity-80 transition-opacity disabled:opacity-50 text-[12px] font-semibold"
                  >
                    {busy === s.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Add
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SubShell>
  );
}

function LibraryIcon({ name, icon }: { name: string; icon?: string | null }) {
  const emoji = skillEmoji(icon);
  const Icon = resolveSkillIcon(name, icon);
  return (
    <div className="shrink-0 w-10 h-10 rounded-[14px] bg-primary/15 text-primary grid place-items-center text-[17px]">
      {emoji ? <span>{emoji}</span> : <Icon className="w-[19px] h-[19px]" strokeWidth={1.9} />}
    </div>
  );
}
