/** @doc Browse and manage installed skills. */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowUp,
  Trash2,
  X,
  Plus,
  Paperclip,
  Loader2,
  Sparkles,
  Search,
  ShieldCheck,
  ChevronRight,
  Blocks,
  Wand2,

} from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSkills, type Skill } from "@/hooks/useSkills";
import { SKILL_TOOLS, SKILL_MODELS } from "@/lib/skillTools";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import MegsyStar from "@/components/files/MegsyStar";
// (goBackOr no longer needed — SubShell handles back nav)
import { getActiveWorkspaceId } from "@/lib/activeWorkspace";
import { SubShell, SubCard, SubSection } from "@/components/settings/SubShell";
import { useConfirm } from "@/components/common/ConfirmDialog";

import { cn } from "@/lib/utils";
import { SkillsAddMenu } from "./components/SkillsExtras";
import { resolveSkillIcon, skillEmoji } from "@/lib/skillIcon";


import { sanitizeErrorMessage } from "@/lib/sanitizeError";
type DraftSkill = Partial<Skill> & {
  name: string;
  description: string;
  body: string;
  triggers: string[];
  enabled_tools: string[];
};

const emptyDraft = (): DraftSkill => ({
  name: "",
  description: "",
  body: "",
  triggers: [],
  enabled_tools: [],
  preferred_model: null,
  icon: null,
});

const SUGGESTIONS = [
  "A YC pitch coach",
  "A TikTok hooks copywriter",
  "A senior code reviewer",
  "A no-nonsense legal advisor",
  "A growth-loop strategist",
  "A 5th grade math tutor",
];

export default function SkillsSettingsPage() {
  const navigate = useNavigate();
  const confirmDialog = useConfirm();

  const location = useLocation();
  const { mySkills, librarySkills, loading, reload, toggleEnabled } = useSkills();
  const [editing, setEditing] = useState<DraftSkill | null>(null);
  const [seedPrompt, setSeedPrompt] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [triggerInput, setTriggerInput] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "enabled">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Open the designer when arriving with a seed prompt from /settings/skills/new
  useEffect(() => {
    const seed = (location.state as { seed?: string } | null)?.seed;
    if (seed && seed.trim()) {
      setSeedPrompt(seed.trim());
      setEditing(emptyDraft());
      // Clear the navigation state so refresh doesn't re-trigger
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const startNew = (prompt = "") => {
    setSeedPrompt(prompt);
    setEditing(emptyDraft());
  };
  const startEdit = (s: Skill) => {
    setSeedPrompt("");
    setEditing({
      ...s,
      body: s.body || s.instructions || "",
      triggers: s.triggers || [],
      enabled_tools: s.enabled_tools || [],
    });
  };

  const handleSave = async (silent = false) => {
    if (!editing) return;
    if (!editing.name.trim()) {
      if (!silent) toast.error("Name is required");
      return;
    }
    if (!editing.body.trim()) {
      if (!silent) toast.error("Instructions are required");
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      if (!silent) toast.error("Sign in required");
      return;
    }

    const payload = {
      user_id: user.id,
      workspace_id: getActiveWorkspaceId(),
      name: editing.name.trim(),
      description: editing.description?.trim() || "",
      instructions: editing.body.trim().slice(0, 6000),
      body: editing.body.trim(),
      triggers: editing.triggers,
      enabled_tools: editing.enabled_tools,
      preferred_model:
        editing.preferred_model && editing.preferred_model !== "auto"
          ? editing.preferred_model
          : null,
      icon: editing.icon || null,
    };

    const res = editing.id
      ? await supabase.from("skills").update(payload).eq("id", editing.id)
      : await supabase.from("skills").insert(payload).select("id").single();

    setSaving(false);
    if (res.error) {
      if (!silent) toast.error(res.error.message);
      return;
    }
    // For brand-new skills, capture the new id so subsequent auto-saves UPDATE in place
    const newId = (res.data as { id?: string } | null)?.id;
    if (!editing.id && newId) {
      setEditing({ ...editing, id: newId });
    }
    if (!silent) {
      toast.success(editing.id ? "Updated" : "Created");
    }
    reload();
  };

  const handleDelete = async (id: string, name?: string) => {
    const ok = await confirmDialog({
      title: "Delete this skill?",
      description: name
        ? `"${name}" will be removed from your workspace. This can't be undone.`
        : "This skill will be removed from your workspace. This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    const { error } = await supabase.from("skills").delete().eq("id", id);
    if (error) {
      toast.error(sanitizeErrorMessage(error, "Something went wrong"));
      return;
    }
    toast.success("Deleted");
    reload();
  };

  const handleAddFromLibrary = async (s: Skill) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
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
    if (error) {
      toast.error(sanitizeErrorMessage(error, "Something went wrong"));
      return;
    }
    toast.success(`Added "${s.name}"`);
    reload();
  };

  const handleImportZip = async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      toast.error("Please pick a .zip file");
      return;
    }
    setImporting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const form = new FormData();
      form.append("file", file);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-skill`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: form,
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error || "Import failed");
      toast.success(`Imported "${json.name}"`);
      reload();
    } catch (e: unknown) {
      toast.error(sanitizeErrorMessage(e, "Import failed"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleTool = (name: string) => {
    if (!editing) return;
    const has = editing.enabled_tools.includes(name);
    setEditing({
      ...editing,
      enabled_tools: has
        ? editing.enabled_tools.filter((t) => t !== name)
        : [...editing.enabled_tools, name],
    });
  };

  const addTrigger = () => {
    if (!editing) return;
    const v = triggerInput.trim().toLowerCase();
    if (!v || editing.triggers.includes(v)) return;
    setEditing({ ...editing, triggers: [...editing.triggers, v] });
    setTriggerInput("");
  };

  const removeTrigger = (t: string) => {
    if (!editing) return;
    setEditing({ ...editing, triggers: editing.triggers.filter((x) => x !== t) });
  };

  // ===== Editor view (conversational AI Skill Designer) =====
  if (editing) {
    return (
      <SkillDesigner
        key={editing.id || "new"}
        draft={editing}
        setDraft={setEditing}
        onClose={() => {
          setEditing(null);
          setSeedPrompt("");
        }}
        onSave={handleSave}
        saving={saving}
        seedPrompt={seedPrompt}
        onImportZip={(f) => {
          handleImportZip(f).then(() => setEditing(null));
        }}
        importing={importing}
        triggerInput={triggerInput}
        setTriggerInput={setTriggerInput}
        addTrigger={addTrigger}
        removeTrigger={removeTrigger}
        toggleTool={toggleTool}
      />
    );
  }

  // ===== List view =====
  const q = query.trim().toLowerCase();
  const filtered = mySkills.filter((s) => {
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description || "").toLowerCase().includes(q)
    );
  });
  const visible = tab === "enabled" ? filtered.filter((s) => s.is_enabled !== false) : filtered;
  const enabledCount = mySkills.filter((s) => s.is_enabled !== false).length;

  return (
    <SubShell
      title="Skills"
      subtitle="Experts Megsy calls automatically inside chat."
      action={
        <SkillsAddMenu
          onCreateWithMegsy={() => navigate("/settings/skills/new")}
          onCreateFromFiles={(f) => handleImportZip(f)}
          onFromLibrary={() => navigate("/settings/skills/library")}
          onFromGithub={(url) =>
            navigate("/settings/skills/new", {
              state: { seed: `Build a skill from this GitHub repository: ${url}` },
            })
          }
        />
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportZip(f);
        }}
      />

      {/* Search */}
      <div className="flex items-center gap-2.5 h-12 px-4 rounded-full bg-[color:var(--mn-sep)]/60 focus-within:bg-[var(--mn-card)] transition-colors">
        <Search className="w-[17px] h-[17px] text-[color:var(--mn-muted)] shrink-0" strokeWidth={1.9} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills"
          className="flex-1 min-w-0 bg-transparent outline-none text-[14.5px] text-[color:var(--mn-fg)] placeholder:text-[color:var(--mn-muted)]"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="h-6 w-6 rounded-full grid place-items-center text-[color:var(--mn-muted)] hover:bg-[color:var(--mn-sep)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Bento: create + quick actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => navigate("/settings/skills/new")}
          className="col-span-2 relative overflow-hidden rounded-[22px] px-5 py-5 text-left active:scale-[0.99] transition-transform"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--primary) / 0.14), hsl(var(--primary) / 0.04) 55%, transparent)",
          }}
        >
          <span
            className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-2xl"
            style={{ background: "hsl(var(--primary) / 0.18)" }}
          />
          <span className="relative flex items-start gap-3.5">
            <span className="shrink-0 w-12 h-12 rounded-[16px] grid place-items-center bg-primary text-primary-foreground shadow-sm">
              <Wand2 className="w-[22px] h-[22px]" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-[color:var(--mn-fg)]">
                Create a skill with Megsy
              </span>
              <span className="mt-1 block text-[12.5px] leading-snug text-[color:var(--mn-muted)]">
                Describe the expert you need — instructions, triggers and tools are written for you.
              </span>
            </span>
            <ChevronRight className="mt-3.5 w-4 h-4 shrink-0 text-[color:var(--mn-muted)]" />
          </span>
        </button>

        <button
          onClick={() => navigate("/settings/skills/library")}
          className="rounded-[18px] bg-[var(--mn-card)] px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
        >
          <span className="w-9 h-9 rounded-[12px] grid place-items-center bg-[color:var(--mn-sep)]">
            <Blocks className="w-[18px] h-[18px] text-[color:var(--mn-fg)]" strokeWidth={1.8} />
          </span>
          <span className="mt-2.5 block text-[13.5px] font-semibold text-[color:var(--mn-fg)]">Library</span>
          <span className="block text-[11.5px] text-[color:var(--mn-muted)]">
            {librarySkills.length > 0 ? `${librarySkills.length} ready-made` : "Official skills"}
          </span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-[18px] bg-[var(--mn-card)] px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
        >
          <span className="w-9 h-9 rounded-[12px] grid place-items-center bg-[color:var(--mn-sep)]">
            {importing ? (
              <Loader2 className="w-[18px] h-[18px] animate-spin text-[color:var(--mn-fg)]" />
            ) : (
              <Paperclip className="w-[18px] h-[18px] text-[color:var(--mn-fg)]" strokeWidth={1.8} />
            )}
          </span>
          <span className="mt-2.5 block text-[13.5px] font-semibold text-[color:var(--mn-fg)]">Import</span>
          <span className="block text-[11.5px] text-[color:var(--mn-muted)]">From a .zip file</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-2">
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 no-scrollbar">
          {(
            [
              { id: "all" as const, label: "All", count: mySkills.length },
              { id: "enabled" as const, label: "Active", count: enabledCount },
            ]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 h-8 px-3.5 rounded-full text-[12.5px] transition-colors",
                tab === t.id
                  ? "bg-[color:var(--mn-fg)] text-[color:var(--mn-card)] font-semibold"
                  : "bg-[color:var(--mn-sep)]/60 text-[color:var(--mn-muted)] font-medium",
              )}
            >
              {t.label}
              {t.count > 0 && <span className="ms-1 tabular-nums opacity-60">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* My skills — grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[132px] rounded-[18px] bg-[var(--mn-card)] animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-14 px-6 rounded-[22px] bg-[var(--mn-card)]">
          <div className="mx-auto w-11 h-11 rounded-full bg-[color:var(--mn-sep)] grid place-items-center mb-3">
            <Blocks className="w-5 h-5 text-[color:var(--mn-muted)]" />
          </div>
          <p className="text-[15px] font-semibold text-[color:var(--mn-fg)]">
            {tab === "enabled" ? "No active skills" : query ? "No matches" : "No skills yet"}
          </p>
          <p className="text-[12.5px] mt-1.5 text-[color:var(--mn-muted)] max-w-[280px] mx-auto leading-relaxed">
            {tab === "enabled"
              ? "Turn one on below, or create a new one."
              : "Create your first expert, or add one from the official library."}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => navigate("/settings/skills/new")}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-semibold bg-primary text-primary-foreground"
            >
              <Plus className="w-3.5 h-3.5" /> Create skill
            </button>
            <button
              onClick={() => navigate("/settings/skills/library")}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium bg-[color:var(--mn-sep)] text-[color:var(--mn-fg)]"
            >
              Official library
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <AnimatePresence initial={false}>
            {visible.map((s, i) => (
              <SkillRowCard
                key={s.id}
                index={i}
                skill={s}
                onEdit={() => startEdit(s)}
                onDelete={() => handleDelete(s.id, s.name)}
                onToggle={(v) => toggleEnabled(s, v)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Inspiration */}
      {visible.length > 0 && (
        <div className="pt-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] mb-3 text-[color:var(--mn-muted)]">
            Inspiration
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.slice(0, 6).map((s) => (
              <button
                key={s}
                onClick={() => navigate("/settings/skills/new", { state: { seed: s } })}
                className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-full text-[12.5px] bg-[color:var(--mn-sep)]/60 text-[color:var(--mn-muted)] active:scale-[0.96] transition-transform"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </SubShell>
  );
}



const SKILL_HUES = [212, 268, 152, 24, 340, 190, 45, 120];

function skillHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return SKILL_HUES[h % SKILL_HUES.length];
}

function SkillAvatar({
  name,
  icon,
  enabled,
  hue,
}: {
  name: string;
  icon?: string | null;
  enabled: boolean;
  hue: number;
}) {
  const emoji = skillEmoji(icon);
  const Icon = resolveSkillIcon(name, icon);
  return (
    <div
      className="shrink-0 w-11 h-11 rounded-[15px] grid place-items-center text-[18px] transition-all"
      style={
        enabled
          ? {
              background: `linear-gradient(140deg, hsl(${hue} 82% 58%), hsl(${hue + 22} 78% 48%))`,
              color: "white",
              boxShadow: `0 6px 16px -8px hsl(${hue} 80% 45% / 0.75)`,
            }
          : {
              background: "var(--mn-sep)",
              color: "var(--mn-muted)",
            }
      }
    >
      {emoji ? <span>{emoji}</span> : <Icon className="w-[21px] h-[21px]" strokeWidth={1.9} />}
    </div>
  );
}


function SkillRowCard({
  skill,
  index = 0,
  onEdit,
  onDelete,
  onToggle,
}: {
  skill: Skill;
  index?: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (v: boolean) => void;
}) {
  const enabled = skill.is_enabled !== false;
  const hue = skillHue(skill.name || "?");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1], delay: Math.min(index, 8) * 0.025 }}
      className="group relative flex flex-col rounded-[18px] bg-[var(--mn-card)] p-3.5 active:scale-[0.985] transition-transform"
    >
      <button onClick={onEdit} className="text-left">
        <SkillAvatar name={skill.name} icon={skill.icon} enabled={enabled} hue={hue} />
        <div className="mt-2.5 flex items-center gap-1">
          <p
            className={cn(
              "text-[14px] font-semibold truncate",
              enabled ? "text-[color:var(--mn-fg)]" : "text-[color:var(--mn-muted)]",
            )}
          >
            {skill.name}
          </p>
          {skill.source === "system" && (
            <ShieldCheck className="w-3.5 h-3.5 text-[color:var(--mn-muted)] shrink-0" />
          )}
        </div>
        <p className="mt-1 text-[11.5px] leading-[1.45] text-[color:var(--mn-muted)] line-clamp-2 min-h-[33px]">
          {skill.description || (enabled ? "Active in chat" : "Paused")}
        </p>
      </button>

      <div className="mt-2.5 pt-2.5 flex items-center justify-between border-t border-[color:var(--mn-sep)]/60">
        <button
          onClick={onDelete}
          aria-label="Delete skill"
          className="h-7 w-7 -ms-1 rounded-full grid place-items-center text-[color:var(--mn-muted)]/60 hover:text-[color:var(--mn-danger)] hover:bg-[color:var(--mn-sep)] transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
    </motion.div>
  );
}




// ===========================================================================
// Conversational Skill Designer
// ===========================================================================
type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  draft?: DraftSkill;
  summary?: string;
};

const STAGES = [
  "Reading your brief",
  "Picking the right voice",
  "Writing instructions",
  "Choosing tools & triggers",
  "Polishing the draft",
];

function SkillDesigner({
  draft,
  setDraft,
  onClose,
  onSave,
  saving,
  seedPrompt,
  onImportZip,
  importing,
  triggerInput,
  setTriggerInput,
  addTrigger,
  removeTrigger,
  toggleTool,
}: {
  draft: DraftSkill;
  setDraft: (d: DraftSkill) => void;
  onClose: () => void;
  onSave: (silent?: boolean) => void;
  saving: boolean;
  seedPrompt?: string;
  onImportZip: (file: File) => void;
  importing: boolean;
  triggerInput: string;
  setTriggerInput: (v: string) => void;
  addTrigger: () => void;
  removeTrigger: (t: string) => void;
  toggleTool: (n: string) => void;
}) {
  const isEdit = !!draft.id;
  const [messages, setMessages] = useState<ChatMsg[]>(() =>
    isEdit
      ? [
          {
            role: "assistant",
            content: `You're editing "${draft.name}". Tell me what you want to change — tone, expertise, tools, triggers — and I'll update the draft.`,
          },
        ]
      : [
          {
            role: "assistant",
            content:
              'Hey! Tell me what kind of expert you want — for example: "a YC pitch coach" or "a TikTok hooks copywriter". I\'ll ask a couple of questions and build it.',
          },
        ],
  );
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  // (preview is desktop-only, mobile users see only chat)
  const scrollRef = useRef<HTMLDivElement>(null);
  const seedSentRef = useRef(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  // Rotate through stage labels while waiting
  useEffect(() => {
    if (!thinking) {
      setStageIdx(0);
      return;
    }
    const id = setInterval(() => setStageIdx((i) => (i + 1) % STAGES.length), 1400);
    return () => clearInterval(id);
  }, [thinking]);

  const sendText = async (text: string) => {
    if (!text || thinking) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setThinking(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-skill`;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await resp.json();
      if (data.action === "draft" && data.skill) {
        const s = data.skill;
        setDraft({
          ...draft,
          name: s.name || draft.name,
          description: s.description || "",
          body: s.body || "",
          triggers: Array.isArray(s.triggers)
            ? s.triggers.map((t: string) => String(t).toLowerCase())
            : [],
          enabled_tools: Array.isArray(s.enabled_tools) ? s.enabled_tools : [],
          preferred_model: s.preferred_model ?? null,
        });
        setMessages([
          ...next,
          {
            role: "assistant",
            content:
              data.summary ||
              `I've drafted "${s.name}". Open the preview to fine-tune anything, or hit Save.`,
            draft: s,
            summary: data.summary,
          },
        ]);
      } else {
        setMessages([
          ...next,
          { role: "assistant", content: data.message || "Could you tell me a bit more?" },
        ]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry — I hit an error. Try again?" }]);
    } finally {
      setThinking(false);
    }
  };

  const send = () => sendText(input.trim());

  // Auto-send the seed prompt from the hero composer
  useEffect(() => {
    if (seedSentRef.current) return;
    if (seedPrompt && seedPrompt.trim()) {
      seedSentRef.current = true;
      sendText(seedPrompt.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt]);

  const hasDraft = !!draft.name && !!draft.body;

  // Auto-save: debounce while user has a valid draft
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!hasDraft) return;
    const sig = JSON.stringify({
      n: draft.name,
      d: draft.description,
      b: draft.body,
      t: draft.triggers,
      e: draft.enabled_tools,
      m: draft.preferred_model,
    });
    if (sig === lastSavedRef.current) return;
    const id = setTimeout(() => {
      lastSavedRef.current = sig;
      onSave(true);
    }, 1500);
    return () => clearTimeout(id);
  }, [
    draft.name,
    draft.description,
    draft.body,
    draft.triggers,
    draft.enabled_tools,
    draft.preferred_model,
    hasDraft,
    onSave,
  ]);

  return (
    <SubShell
      title={isEdit ? draft.name || "Edit skill" : "Design a skill"}
      subtitle={
        saving
          ? "Saving…"
          : hasDraft
            ? "Changes save automatically."
            : "Tell Megsy what expert you need and it drafts the skill."
      }
      onBack={onClose}
      action={
        <button
          onClick={onClose}
          className="h-9 px-4 rounded-full text-[13px] font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      }
    >
      {/* Designer chat */}
      <SubSection
        title="Designer"
        description="Describe or refine the skill in plain language."
      >
        <SubCard flush>
          <div
            ref={scrollRef}
            className="min-h-[200px] max-h-[46vh] overflow-y-auto px-4 py-4 space-y-4"
          >
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-[16px] rounded-br-[6px] px-3.5 py-2.5 bg-primary text-primary-foreground text-[13.5px] whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 w-full">
                    <div className="shrink-0 mt-0.5">
                      <MegsyStar size={18} static />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] whitespace-pre-wrap leading-relaxed text-[color:var(--mn-fg)]">
                        {m.content}
                      </p>
                      {m.draft && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11.5px] font-semibold">
                          <Sparkles className="w-3 h-3" /> Draft ready · {m.draft.name}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <AnimatePresence>
              {thinking && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5"
                >
                  <div className="shrink-0 mt-0.5">
                    <MegsyStar size={18} static />
                  </div>
                  <div className="flex-1">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={stageIdx}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.25 }}
                        className="text-[13.5px] font-semibold text-[color:var(--mn-fg)]"
                      >
                        {STAGES[stageIdx]}…
                      </motion.p>
                    </AnimatePresence>
                    <div className="mt-2 flex gap-1">
                      {STAGES.map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1 rounded-full transition-all",
                            i <= stageIdx ? "bg-primary w-6" : "bg-[color:var(--mn-sep)] w-3",
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-[color:var(--mn-sep)] p-2.5">
            <div className="relative rounded-[12px] bg-[color:var(--mn-press,var(--mn-sep))]">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    (typeof window === "undefined" || window.innerWidth >= 768)
                  ) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={
                  hasDraft ? "Refine it — \"make the tone bolder\"…" : "Describe the expert you want…"
                }
                className="w-full resize-none bg-transparent outline-none text-[13.5px] leading-relaxed pl-11 pr-12 pt-3 pb-3 max-h-32 text-[color:var(--mn-fg)] placeholder:text-[color:var(--mn-muted)]"
              />
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportZip(f);
                }}
              />
              <button
                type="button"
                onClick={() => zipInputRef.current?.click()}
                disabled={importing}
                aria-label="Import .zip"
                className="absolute left-2 bottom-2 h-8 w-8 rounded-full flex items-center justify-center text-[color:var(--mn-muted)] hover:text-[color:var(--mn-fg)] transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              </button>
              <button
                onClick={send}
                disabled={!input.trim() || thinking}
                aria-label="Send"
                className="absolute right-2 bottom-2 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </SubCard>
      </SubSection>

      {!hasDraft ? (
        <SubCard className="text-center py-10">
          <div className="mx-auto mb-3">
            <MegsyStar size={28} static />
          </div>
          <p className="text-[14px] font-semibold text-[color:var(--mn-fg)]">
            Your skill will appear here
          </p>
          <p className="mt-1.5 text-[12.5px] text-[color:var(--mn-muted)] max-w-[280px] mx-auto leading-relaxed">
            Once Megsy drafts it, every field below becomes editable.
          </p>
        </SubCard>
      ) : (
        <>
          <SubSection title="Identity" description="How this skill shows up in your library.">
            <SubCard className="space-y-3.5">
              <Field label="Name">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-10 bg-transparent border-[color:var(--mn-sep)] text-[13.5px]"
                />
              </Field>
              <Field label="Description">
                <Input
                  value={draft.description || ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="One line about what it does"
                  className="h-10 bg-transparent border-[color:var(--mn-sep)] text-[13.5px]"
                />
              </Field>
            </SubCard>
          </SubSection>

          <SubSection
            title="Triggers"
            description="Keywords that let Megsy pick this skill automatically."
          >
            <SubCard>
              <div className="flex gap-1.5 flex-wrap min-h-[34px] items-center">
                {draft.triggers.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 text-[11.5px] px-2.5 py-1 rounded-full bg-primary/12 text-primary"
                  >
                    {t}
                    <button
                      onClick={() => removeTrigger(t)}
                      aria-label={`Remove ${t}`}
                      className="hover:bg-primary/25 rounded-full p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  value={triggerInput}
                  onChange={(e) => setTriggerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTrigger();
                    }
                  }}
                  onBlur={addTrigger}
                  placeholder="add keyword…"
                  className="flex-1 min-w-[110px] bg-transparent outline-none text-[12.5px] px-1 text-[color:var(--mn-fg)] placeholder:text-[color:var(--mn-muted)]"
                />
              </div>
            </SubCard>
          </SubSection>

          <SubSection title="Instructions" description="The system prompt Megsy follows for this skill.">
            <SubCard flush>
              <Textarea
                rows={12}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="border-0 bg-transparent font-mono text-[12px] leading-relaxed resize-y focus-visible:ring-0 text-[color:var(--mn-fg)]"
              />
            </SubCard>
          </SubSection>

          <SubSection title="Tools" description="What this skill is allowed to use.">
            <div className="grid grid-cols-2 gap-2">
              {SKILL_TOOLS.map((tool) => {
                const active = draft.enabled_tools.includes(tool.name);
                return (
                  <button
                    key={tool.name}
                    onClick={() => toggleTool(tool.name)}
                    className={cn(
                      "text-left px-3.5 py-3 rounded-[12px] text-[12.5px] font-medium transition-colors",
                      active
                        ? "bg-primary/12 text-primary"
                        : "bg-[var(--mn-card)] text-[color:var(--mn-muted)]",
                    )}
                  >
                    {tool.label}
                  </button>
                );
              })}
            </div>
          </SubSection>

          <SubSection title="Model" description="Leave on Auto unless this skill needs a specific model.">
            <SubCard flush>
              <select
                value={draft.preferred_model || "auto"}
                onChange={(e) => setDraft({ ...draft, preferred_model: e.target.value })}
                className="w-full h-12 bg-transparent px-4 text-[13.5px] outline-none text-[color:var(--mn-fg)]"
              >
                {SKILL_MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-background text-foreground">
                    {m.label}
                  </option>
                ))}
              </select>
            </SubCard>
          </SubSection>
        </>
      )}
    </SubShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mn-muted)]">
        {label}
      </Label>
      {children}
    </div>
  );
}
