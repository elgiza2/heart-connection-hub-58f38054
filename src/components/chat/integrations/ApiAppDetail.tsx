/** @doc Detail view of one ready-made API app: credentials setup + its tools.
 *
 *  Layout is a single column of quiet cards — identity, connection, actions —
 *  so a service with five named credential fields reads as calmly as one with
 *  a single key. All colours come from the design tokens.
 */
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ApiApp } from "@/lib/apiApps/types";
import {
  listApiApps,
  removeApiApp,
  saveApiAppCredentials,
  setApiAppEnabled,
} from "@/lib/apiApps/client";
import ApiAppLogo from "./ApiAppLogo";

const CARD =
  "rounded-[18px] bg-foreground/[0.035] px-4 py-4 ring-1 ring-inset ring-foreground/[0.06]";

export default function ApiAppDetail({
  app,
  onBack,
  onChanged,
  onUse,
}: {
  app: ApiApp;
  onBack: () => void;
  onChanged?: () => void;
  onUse?: () => void;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const fields =
    app.credentials && app.credentials.length > 0
      ? app.credentials
      : [{ name: "apiKey", label: "API key", secret: true, description: "", example: "" }];
  const [values, setValues] = useState<Record<string, string>>({});
  const complete = fields.every((field) => (values[field.name] ?? "").trim().length > 0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const rows = await listApiApps();
      const row = rows.find((r) => r.app_id === app.id);
      setHint(row?.key_hint ?? null);
      setEnabled(row ? row.enabled : true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  const save = async () => {
    setSaving(true);
    try {
      await saveApiAppCredentials(app.id, values, {
        name: app.name,
        logo: app.logo,
        spec: {
          baseUrl: app.baseUrl,
          auth: app.auth ?? null,
          authTemplate: app.authTemplate ?? null,
          basic: app.basic ?? false,
          tools: app.tools,
        },
      });
      setValues({});
      await load();
      onChanged?.();
      toast.success(`${app.name} is ready`);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the credentials");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await removeApiApp(app.id);
      setHint(null);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove");
    }
  };

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      await setApiAppEnabled(app.id, next);
      onChanged?.();
    } catch (e: any) {
      setEnabled(!next);
      toast.error(e?.message || "Couldn't save");
    }
  };

  return (
    <div dir="ltr" className="flex min-h-full flex-col pb-4">
      {/* Header — bare back button, no background or borders */}
      <div className="flex shrink-0 items-center px-1 pb-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground/70 transition-opacity active:opacity-60"
          style={{ border: 0, background: "transparent" }}
        >
          <ChevronLeft className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Identity */}
      <div className="flex items-center gap-3.5 px-1 pt-3">
        <ApiAppLogo app={app} size={56} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[18px] font-semibold leading-tight text-foreground">
            {app.name}
          </h3>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-foreground/65">{app.description}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-foreground/65">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : hint ? (
        <div className={`mt-4 ${CARD}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">Credentials saved</p>
              <p className="mt-0.5 truncate text-[12px] text-foreground/65">{hint}</p>
            </div>
            <button
              type="button"
              onClick={() => void remove()}
              aria-label="Remove credentials"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive transition-opacity active:opacity-60"
              style={{ border: 0 }}
            >
              <Trash2 className="h-[16px] w-[16px]" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-foreground/[0.06] pt-3">
            <span className="text-[12.5px] text-foreground/55">Use in chat</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`Use ${app.name} in chat`}
              onClick={() => void toggle()}
              className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                enabled ? "bg-primary" : "bg-foreground/15"
              }`}
              style={{ border: 0 }}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${
                  enabled ? "start-[18px]" : "start-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      ) : (
        <div className={`mt-4 ${CARD}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-foreground">
                {fields.length > 1 ? "Your credentials" : "Your API key"}
              </p>
            </div>
            {app.keyUrl && (
              <button
                type="button"
                onClick={() => window.open(app.keyUrl, "_blank", "noopener")}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-foreground/70 transition-opacity active:opacity-60"
                style={{ border: 0 }}
              >
                Where to find it
                <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {fields.map((field) => (
              <label key={field.name} className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium text-foreground/50">
                  {field.label}
                </span>
                <input
                  value={values[field.name] ?? ""}
                  onChange={(e) =>
                    setValues((current) => ({ ...current, [field.name]: e.target.value }))
                  }
                  type={field.secret ? "password" : "text"}
                  placeholder={field.example || field.label}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-[12px] bg-background/60 px-3 text-[13.5px] text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] transition-shadow placeholder:text-foreground/65 focus:ring-primary/50"
                  style={{ border: 0, boxShadow: "none" }}
                />
                {field.description && (
                  <span className="mt-1.5 block text-[11px] leading-[1.55] text-foreground/65">
                    {field.description}
                  </span>
                )}
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled={saving || !complete}
            onClick={() => void save()}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-primary text-[13.5px] font-semibold text-primary-foreground transition-opacity active:opacity-70 disabled:opacity-35"
            style={{ border: 0 }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
          </button>
        </div>
      )}

      {app.tools.length > 0 && (
        <div className={`mt-3 ${CARD} px-0 py-0`}>
          <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
            <span className="text-[13px] font-medium text-foreground">What it can do</span>
            <span className="text-[11.5px] text-foreground/65">{app.tools.length}</span>
          </div>
          <div className="pb-2">
            {app.tools.map((tool) => (
              <button
                key={tool.name}
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("megsy:composer-insert", {
                      detail: { text: `Use ${app.name} → ${tool.name}: ` },
                    }),
                  );
                  onUse?.();
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors active:bg-foreground/[0.04]"
                style={{ border: 0, background: "transparent" }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground/85">
                    {tool.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-foreground/65">
                    {tool.description}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-foreground/65" />
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => window.open(app.docsUrl, "_blank", "noopener")}
        className="mt-3 inline-flex h-11 items-center justify-center gap-1.5 rounded-[14px] bg-foreground/[0.04] text-[12.5px] font-medium text-foreground/55 transition-opacity active:opacity-60"
        style={{ border: 0 }}
      >
        Documentation
        <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
