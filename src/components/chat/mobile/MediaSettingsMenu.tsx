import { useEffect, useState } from "react";
import { Settings2, Volume2, Film, Layers, ChevronDown } from "lucide-react";
import {
  DropdownMenu as AnimateDropdownMenu,
  DropdownMenuContent as AnimateDropdownMenuContent,
  DropdownMenuTrigger as AnimateDropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { translateExactText, useUserLang } from "@/lib/authI18n";

export type MediaMode = "images" | "video";

export interface MediaSettings {
  quality: "standard" | "hd" | "ultra";
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  count: 1 | 2 | 3 | 4;
  /** Video only: clip duration in seconds. */
  duration?: 5 | 8 | 10 | 15;
  /** Video only: when true (default), AI writes the cinematic prompt from your idea.
   *  When false, your text is sent to the model as-is. */
  autoPrompt?: boolean;
}

const DEFAULTS: Record<MediaMode, MediaSettings> = {
  images: { quality: "hd", aspectRatio: "1:1", count: 1, autoPrompt: true },
  video: { quality: "standard", aspectRatio: "16:9", count: 1, duration: 5, autoPrompt: true },
};

const storageKey = (mode: MediaMode) => `megsy.mediaSettings.v2.${mode}`;

export function loadMediaSettings(mode: MediaMode): MediaSettings {
  try {
    const raw = localStorage.getItem(storageKey(mode));
    if (!raw) return DEFAULTS[mode];
    const loaded = { ...DEFAULTS[mode], ...JSON.parse(raw) } as MediaSettings;
    return mode === "images" ? { ...loaded, count: 1 } : loaded;
  } catch {
    return DEFAULTS[mode];
  }
}

export function saveMediaSettings(mode: MediaMode, s: MediaSettings) {
  try {
    localStorage.setItem(storageKey(mode), JSON.stringify(s));
  } catch {
    /* noop */
  }
}

const QUALITY: { id: MediaSettings["quality"]; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "hd", label: "HD" },
  { id: "ultra", label: "Ultra" },
];

const RATIOS: { id: MediaSettings["aspectRatio"]; w: number; h: number }[] = [
  { id: "1:1", w: 18, h: 18 },
  { id: "16:9", w: 28, h: 16 },
  { id: "9:16", w: 14, h: 22 },
  { id: "4:3", w: 24, h: 18 },
  { id: "3:4", w: 16, h: 22 },
];

const COUNTS: MediaSettings["count"][] = [1, 2, 3, 4];
const DURATIONS: NonNullable<MediaSettings["duration"]>[] = [5, 8, 10, 15];

interface Props {
  mode: MediaMode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onChange?: (s: MediaSettings) => void;
}

export default function MediaSettingsMenu({ mode, open, onOpenChange, onChange }: Props) {
  const lang = useUserLang();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <AnimateDropdownMenu open={isOpen} onOpenChange={setOpen}>
      <AnimateDropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={translateExactText("Generation settings", lang)}
          className="inline-flex h-9 items-center gap-2 rounded-full pl-1 pr-3 text-[12.5px] font-semibold text-foreground border border-foreground/15 active:scale-95 transition"
          style={{
            background: "hsl(var(--foreground) / 0.09)",
            backdropFilter: "blur(18px) saturate(170%)",
            boxShadow: "inset 1px 1px 1px 0 hsl(var(--foreground) / 0.22)",
          }}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-foreground/15"
            style={{ background: "hsl(var(--foreground) / 0.12)" }}
          >
            <Settings2 className="h-3.5 w-3.5 text-foreground/85" />
          </span>
          <span className="tracking-tight">{translateExactText("Settings", lang)}</span>
        </button>
      </AnimateDropdownMenuTrigger>
      <AnimateDropdownMenuContent
        data-tier-menu
        data-media-settings-menu
        side="top"
        align="end"
        sideOffset={10}
        className="z-[61] w-[min(360px,calc(100vw-16px))] rounded-[24px] border border-foreground/15 p-4 unified-menu-surface"
        style={{
          background: "hsl(var(--foreground) / 0.08)",
          backdropFilter: "blur(24px) saturate(180%) brightness(1.05)",
          boxShadow:
            "inset 1px 1px 1px 0 hsl(var(--foreground) / 0.22), 0 18px 44px hsl(0 0% 0% / 0.4)",
        }}
      >
        <MediaSettingsPanel mode={mode} onChange={onChange} showHeader />
      </AnimateDropdownMenuContent>
    </AnimateDropdownMenu>
  );
}

export function MediaSettingsPanel({
  mode,
  onChange,
  showHeader = false,
  className = "",
}: {
  mode: MediaMode;
  onChange?: (s: MediaSettings) => void;
  showHeader?: boolean;
  className?: string;
}) {
  const lang = useUserLang();
  const tx = (text: string) => translateExactText(text, lang);
  const [settings, setSettings] = useState<MediaSettings>(() => loadMediaSettings(mode));
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggle = (id: string) => setOpenSection((cur) => (cur === id ? null : id));

  useEffect(() => {
    setSettings(loadMediaSettings(mode));
  }, [mode]);

  const update = (patch: Partial<MediaSettings>) => {
    const next = { ...settings, ...patch } as MediaSettings;
    setSettings(next);
    saveMediaSettings(mode, next);
    onChange?.(next);
  };

  const isVideo = mode === "video";

  const qualityLabel = QUALITY.find((q) => q.id === settings.quality)?.label ?? "";
  const summary = isVideo
    ? `${settings.aspectRatio} · ${settings.duration ?? 5}s · ×${settings.count}`
    : `${settings.aspectRatio} · ${qualityLabel} · ×${settings.count}`;

  return (
    <div className={`space-y-1 ${className}`}>
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold tracking-tight text-foreground">
              {tx(isVideo ? "Video settings" : "Image settings")}
            </div>
            <div className="text-[10.5px] text-foreground/50 font-medium mt-0.5 truncate">
              {summary}
            </div>
          </div>
          <span
            className="shrink-0 text-[9.5px] uppercase tracking-[0.22em] text-foreground/85 font-semibold px-2.5 py-1 rounded-full border border-foreground/15"
            style={{ background: "hsl(var(--foreground) / 0.1)" }}
          >
            {tx(isVideo ? "Video" : "Image")}
          </span>
        </div>
      )}

      <div className="min-w-0 border-b border-foreground/[0.08] py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
            {tx("Prompt mode")}
          </div>
          <div className="text-[10.5px] text-foreground/65 font-medium mt-1 leading-snug">
            {settings.autoPrompt !== false
              ? isVideo
                ? tx("AI turns your idea into a cinematic prompt.")
                : tx("AI enhances your idea into a detailed visual prompt.")
              : tx("Your text is sent to the model as-is.")}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.autoPrompt !== false}
          onClick={() => update({ autoPrompt: !(settings.autoPrompt !== false) })}
          className={`shrink-0 mt-0.5 relative inline-flex h-7 w-12 items-center rounded-full border border-foreground/15 transition-colors ${
            settings.autoPrompt !== false ? "bg-foreground/30" : "bg-foreground/10"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-foreground transition-transform ${
              settings.autoPrompt !== false ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>



      <Collapsible
        id="aspect"
        label={tx("Aspect")}
        value={settings.aspectRatio}
        open={openSection === "aspect"}
        onToggle={toggle}
      >
        <div className="grid grid-cols-5 gap-1.5">
          {RATIOS.map((r) => {
            const active = settings.aspectRatio === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => update({ aspectRatio: r.id })}
                className={`flex flex-col items-center justify-center gap-1 h-[58px] rounded-2xl border transition-all active:scale-95 ${
                  active
                    ? "border-foreground/25 text-foreground"
                    : "border-foreground/10 text-foreground/60"
                }`}
                style={
                  active
                    ? {
                        background: "hsl(var(--foreground) / 0.16)",
                        boxShadow: "inset 1px 1px 1px 0 hsl(var(--foreground) / 0.22)",
                      }
                    : { background: "hsl(var(--foreground) / 0.05)" }
                }
              >
                <span
                  className={`rounded-[3px] border-2 ${active ? "border-foreground/70" : "border-foreground/35"}`}
                  style={{ width: r.w * 0.8, height: r.h * 0.8 }}
                />
                <span className="text-[10px] font-semibold tabular-nums leading-none">{r.id}</span>
              </button>
            );
          })}
        </div>
      </Collapsible>

      {isVideo && (
        <Collapsible
          id="duration"
          label={tx("Duration")}
          value={`${settings.duration ?? 5}s`}
          open={openSection === "duration"}
          onToggle={toggle}
        >
          <Segmented
            items={DURATIONS.map((d) => ({ id: String(d), label: `${d}s` }))}
            value={String(settings.duration ?? 5)}
            onChange={(id) => update({ duration: Number(id) as MediaSettings["duration"] })}
          />
        </Collapsible>
      )}

      {isVideo && (
        <Collapsible
          id="count"
          label={tx("Videos")}
          value={`×${settings.count}`}
          open={openSection === "count"}
          onToggle={toggle}
        >
          <Segmented
            items={COUNTS.map((c) => ({ id: String(c), label: `×${c}` }))}
            value={String(settings.count)}
            onChange={(id) => update({ count: Number(id) as MediaSettings["count"] })}
          />
        </Collapsible>
      )}
      {!isVideo && (
        <Collapsible
          id="quality"
          label={tx("Quality")}
          value={qualityLabel}
          open={openSection === "quality"}
          onToggle={toggle}
        >
          <Segmented
            items={QUALITY.map((q) => ({ id: q.id, label: q.label }))}
            value={settings.quality}
            onChange={(id) => update({ quality: id as MediaSettings["quality"] })}
          />
        </Collapsible>
      )}

      <Collapsible
        id="attachments"
        label={tx("Attachments")}
        value={tx(isVideo ? "Refs · Frames · Audio" : "References")}
        open={openSection === "attachments"}
        onToggle={toggle}
      >
        <div className="flex flex-col">
          <AttachTile
            title={tx(isVideo ? "References" : "Reference images")}
            hint={isVideo ? tx("Up to 9 · style / chars") : tx("Up to 4 · style / chars")}
          />
          {isVideo && (
            <AttachTile title={tx("Start + end frames")} hint={tx("Interpolate motion between two frames")} />
          )}
          {isVideo && <AttachTile title={tx("Audio")} hint={tx("Lip-sync or score (Wan 2.5)")} />}
        </div>
      </Collapsible>
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/65">
          {label}
        </span>
        {value && (
          <span className="shrink-0 text-[11px] font-semibold text-foreground/90 tabular-nums">
            {value}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Collapsible({
  id,
  label,
  value,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  value?: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-b border-foreground/[0.08] last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 py-3 text-left transition-colors"
      >
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
          {label}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {value && (
            <span className="text-[11.5px] font-semibold text-foreground tabular-nums truncate max-w-[160px]">
              {value}
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-foreground/70 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && <div className="pb-3 pt-1">{children}</div>}
    </div>
  );
}

function Segmented({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="inline-flex w-full p-1 rounded-xl border border-foreground/12"
      style={{ background: "hsl(var(--foreground) / 0.06)" }}
    >
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className={`flex-1 h-8 inline-flex items-center justify-center rounded-lg text-[12px] font-semibold transition-all active:scale-95 ${
              active
                ? "text-foreground border border-foreground/20"
                : "text-foreground/55 hover:text-foreground/85"
            }`}
            style={
              active
                ? {
                    background: "hsl(var(--foreground) / 0.16)",
                    boxShadow: "inset 1px 1px 1px 0 hsl(var(--foreground) / 0.22)",
                  }
                : undefined
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 inline-flex items-center justify-center rounded-xl text-[12.5px] font-semibold border transition-all active:scale-95 ${
        active
          ? "bg-foreground text-background border-foreground shadow-[0_6px_20px_-6px_var(--overlay-black-35)]"
          : "bg-foreground/[0.03] text-foreground/80 border-foreground/[0.08] hover:bg-foreground/[0.07] hover:border-foreground/[0.12]"
      }`}
    >
      {children}
    </button>
  );
}

function AttachTile({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div
      className="flex items-start gap-2.5 py-2 px-3 rounded-xl border border-foreground/12 mb-1.5 last:mb-0"
      style={{ background: "hsl(var(--foreground) / 0.06)" }}
    >
      {icon && <div className="mt-0.5 shrink-0 text-foreground/55">{icon}</div>}
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-foreground leading-tight">{title}</div>
        <div className="text-[10.5px] text-foreground/50 font-medium leading-snug mt-0.5">
          {hint}
        </div>
      </div>
    </div>
  );
}
