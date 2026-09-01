/** @doc Inline connect box rendered inside an assistant message.
 *
 *  Two shapes, one visual language: an MCP server (url + optional headers) or
 *  a ready-made API app (its own named credential fields). Everything is saved
 *  through the same helpers the Integrations sheet uses, so a connection made
 *  from chat behaves exactly like one made from settings.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plug, Server } from "lucide-react";
import { toast } from "sonner";
import type { ConnectSpec } from "@/lib/chat/connectCardParser";
import { addMcpServer } from "@/lib/mcp/client";
import { saveApiAppCredentials } from "@/lib/apiApps/client";
import { MANUS_APPS } from "@/lib/apiApps/manus";
import { loadNangoApps } from "@/lib/apiApps/nango.generated";
import type { ApiApp } from "@/lib/apiApps/types";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";

const CARD =
  "my-2 rounded-[20px] bg-foreground/[0.035] p-4 ring-1 ring-inset ring-foreground/[0.06]";
const FIELD =
  "h-11 w-full rounded-[13px] bg-background px-3.5 text-[14px] text-foreground outline-none placeholder:text-foreground/65";

function findApp(appId: string, nangoApps: ApiApp[]): ApiApp | null {
  const key = appId.trim().toLowerCase();
  const all = [...MANUS_APPS, ...nangoApps];
  return (
    all.find((a) => a.id.toLowerCase() === key) ??
    all.find((a) => a.name.toLowerCase() === key) ??
    null
  );
}

export default function ConnectCard({ spec }: { spec: ConnectSpec }) {
  const [nangoApps, setNangoApps] = useState<ApiApp[]>([]);
  useEffect(() => {
    if (spec.kind !== "api") return;
    let alive = true;
    loadNangoApps().then((apps) => {
      if (alive) setNangoApps(apps);
    });
    return () => {
      alive = false;
    };
  }, [spec.kind]);
  const app = useMemo(
    () => (spec.kind === "api" ? findApp(spec.appId || "", nangoApps) : null),
    [spec, nangoApps],
  );
  const fields = useMemo(() => {
    if (spec.kind !== "api") return [];
    if (app?.credentials?.length) return app.credentials;
    return [{ name: "apiKey", label: "API key", secret: true }];
  }, [spec.kind, app]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [url, setUrl] = useState(spec.url ?? "");
  const [name, setName] = useState(spec.kind === "mcp" ? (spec.name ?? "") : "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const title = spec.kind === "mcp" ? spec.name || "MCP server" : app?.name || spec.name || spec.appId;
  const ready =
    spec.kind === "mcp"
      ? url.trim().length > 6
      : fields.every((f) => (values[f.name] ?? "").trim().length > 0);

  const connect = async () => {
    setBusy(true);
    try {
      if (spec.kind === "mcp") {
        const res = await addMcpServer({ name: name.trim() || undefined, url: url.trim() });
        if (res.ok === false) throw new Error(res.error || "Could not connect");
        notifyTurnContextChanged();
        if (res.authorize_url) {
          window.location.href = res.authorize_url;
          return;
        }
        const count = Array.isArray(res.tools) ? res.tools.length : 0;
        toast.success(count ? `Connected — ${count} tools ready` : "Server connected");
      } else {
        const id = app?.id || spec.appId || "";
        await saveApiAppCredentials(id, values, {
          name: app?.name ?? title,
          logo: app?.logo,
          spec: app
            ? {
                baseUrl: app.baseUrl,
                auth: app.auth ?? null,
                authTemplate: app.authTemplate ?? null,
                basic: app.basic ?? false,
                tools: app.tools,
              }
            : null,
        });
        toast.success(`${title} is ready`);
      }
      setValues({});
      setDone(true);
    } catch (e: any) {
      toast.error(e?.message || "Could not connect");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className={CARD} dir="ltr">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/10">
            <Check className="h-4 w-4 text-emerald-500" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-foreground">{title} connected</p>
            <p className="text-[12px] text-foreground/65">Its tools are available in this chat.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={CARD} dir="ltr">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-foreground/[0.06]">
          {spec.kind === "mcp" ? (
            <Server className="h-4 w-4 text-foreground/60" />
          ) : (
            <Plug className="h-4 w-4 text-foreground/60" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-foreground">Connect {title}</p>
          <p className="truncate text-[12px] text-foreground/65">
            {spec.note || (spec.kind === "mcp" ? "Add the server URL" : "Add the required keys")}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {spec.kind === "mcp" ? (
          <>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className={FIELD}
              style={{ border: 0 }}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className={FIELD}
              style={{ border: 0 }}
            />
          </>
        ) : (
          fields.map((field) => (
            <div key={field.name}>
              <p className="mb-1 px-1 text-[12px] text-foreground/65">{field.label}</p>
              <input
                type={field.secret === false ? "text" : "password"}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                placeholder={field.label}
                autoComplete="off"
                className={FIELD}
                style={{ border: 0 }}
              />
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => void connect()}
        disabled={busy || !ready}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[13px] bg-primary text-[14px] font-medium text-primary-foreground disabled:opacity-50"
        style={{ border: 0 }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Connecting…" : "Connect"}
      </button>

      {spec.kind === "api" && app?.keyUrl ? (
        <a
          href={app.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block text-center text-[12px] text-foreground/65 underline-offset-4 hover:underline"
        >
          Where do I find these keys?
        </a>
      ) : null}
    </div>
  );
}
