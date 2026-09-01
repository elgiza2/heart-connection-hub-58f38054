/** MCP tab — connect and manage Model Context Protocol servers. */
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";
import {
  addMcpServer,
  authorizeMcpServer,
  listMcpServers,
  probeMcpServer,
  removeMcpServer,
  updateMcpServer,
  type McpServer,
} from "@/lib/mcp/client";

function parseHeaders(text: string): Record<string, string> {
  if (!text.trim()) return {};
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object") return obj as Record<string, string>;
  } catch {
    /* line format below */
  }
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function State({ server }: { server: McpServer }) {
  if (server.state === "connected")
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-500">
        <CheckCircle2 className="h-3.5 w-3.5" /> Connected
      </span>
    );
  if (server.state === "needs_auth")
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-amber-500">
        <Lock className="h-3.5 w-3.5" /> Sign-in required
      </span>
    );
  if (server.state === "error")
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-destructive">
        <AlertCircle className="h-3.5 w-3.5" /> Not reachable
      </span>
    );
  return <span className="text-[11.5px] text-foreground/65">Checking…</span>;
}

export default function McpTab({
  query = "",
  onCreateFromChat,
}: {
  query?: string;
  onCreateFromChat?: () => void;
}) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMcpServers();
      setServers(res.servers ?? []);
    } catch (err) {
      toast.error((err as Error).message);
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const authorize = (res: { authorize_url?: string }) => {
    if (res.authorize_url) {
      window.location.href = res.authorize_url;
      return true;
    }
    return false;
  };

  const onAdd = async () => {
    if (!url.trim()) {
      toast.error("Server URL is required");
      return;
    }
    setSaving(true);
    try {
      const res = await addMcpServer({
        name: name.trim() || undefined,
        url: url.trim(),
        headers: parseHeaders(headersText),
      });
      if (res.ok === false) throw new Error(res.error || "Could not connect");
      setAdding(false);
      setName("");
      setUrl("");
      setHeadersText("");
      notifyTurnContextChanged();
      if (authorize(res)) return;
      const count = Array.isArray(res.tools) ? res.tools.length : 0;
      toast.success(count ? `Connected — ${count} tools found` : "Server added");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = async (server: McpServer) => {
    setBusyId(server.id);
    try {
      const res = await probeMcpServer(server.id);
      if (authorize(res)) return;
      if (res.error) toast.error(String(res.error));
      else toast.success(`${Array.isArray(res.tools) ? res.tools.length : 0} tools available`);
      notifyTurnContextChanged();
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const onSignIn = async (server: McpServer) => {
    setBusyId(server.id);
    try {
      const res = await authorizeMcpServer(server.id);
      if (authorize(res)) return;
      toast.error(String(res.error || "This server does not support hosted sign-in"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const onToggle = async (server: McpServer) => {
    const enabled = !server.enabled;
    setServers((rows) => rows.map((r) => (r.id === server.id ? { ...r, enabled } : r)));
    try {
      await updateMcpServer(server.id, { enabled });
      notifyTurnContextChanged();
    } catch (err) {
      toast.error((err as Error).message);
      await load();
    }
  };

  const onRemove = async (server: McpServer) => {
    setBusyId(server.id);
    try {
      await removeMcpServer(server.id);
      notifyTurnContextChanged();
      setServers((rows) => rows.filter((r) => r.id !== server.id));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const list = q
    ? servers.filter((s) => `${s.name} ${s.url}`.toLowerCase().includes(q))
    : servers;

  return (
    <div className="pb-4">
      {adding ? (
        <div className="rounded-[22px] bg-foreground/[0.035] p-4 ring-1 ring-inset ring-foreground/[0.06]">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-foreground/[0.06]">
              <Server className="h-4 w-4 text-foreground/60" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-foreground">New MCP server</p>
              <p className="text-[12px] text-foreground/65">Paste the server URL to connect it</p>
            </div>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 transition-colors active:bg-foreground/[0.06]"
              style={{ border: 0, background: "transparent" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2.5">
            <div>
              <p className="mb-1 px-1 text-[12px] text-foreground/65">Server URL</p>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/mcp"
                autoComplete="off"
                className="h-11 w-full rounded-[13px] bg-background px-3.5 text-[14px] text-foreground outline-none placeholder:text-foreground/65"
                style={{ border: 0 }}
              />
            </div>
            <div>
              <p className="mb-1 px-1 text-[12px] text-foreground/65">Name (optional)</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My server"
                autoComplete="off"
                className="h-11 w-full rounded-[13px] bg-background px-3.5 text-[14px] text-foreground outline-none placeholder:text-foreground/65"
                style={{ border: 0 }}
              />
            </div>
            <div>
              <p className="mb-1 px-1 text-[12px] text-foreground/65">Headers (optional)</p>
              <textarea
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                placeholder="Authorization: Bearer …"
                rows={2}
                className="w-full resize-none rounded-[13px] bg-background px-3.5 py-2.5 text-[13px] text-foreground outline-none placeholder:text-foreground/65"
                style={{ border: 0 }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onAdd()}
            disabled={saving || url.trim().length < 8}
            className="mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-[13px] bg-primary text-[14px] font-medium text-primary-foreground disabled:opacity-50"
            style={{ border: 0 }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Connecting…" : "Connect server"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-11 w-full items-center gap-2 rounded-[14px] bg-foreground/[0.05] px-3.5 text-[14px] text-foreground"
            style={{ border: 0 }}
          >
            <Plus className="h-4 w-4" />
            Add an MCP server
          </button>
          {onCreateFromChat ? (
            <button
              type="button"
              onClick={onCreateFromChat}
              className="flex h-11 w-full items-center gap-2 rounded-[14px] px-3.5 text-[14px] text-foreground"
              style={{ border: 0, background: "transparent" }}
            >
              <MessageSquarePlus className="h-4 w-4" />
              Create from chat
            </button>
          ) : null}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="px-2 py-8 text-center text-[13px] text-foreground/65">Loading…</p>
        ) : list.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-foreground/[0.05]">
              <Server className="h-5 w-5 text-foreground/65" />
            </div>
            <p className="text-[14px] text-foreground">No MCP servers yet</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/65">
              Connect a server to use its tools directly inside your chats.
            </p>
          </div>
        ) : (
          list.map((server) => (
            <div key={server.id} className="rounded-[18px] bg-foreground/[0.04] p-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-foreground">{server.name}</p>
                  <p className="truncate text-[12px] text-foreground/65">{hostOf(server.url)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void onToggle(server)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] ${
                    server.enabled ? "bg-foreground/[0.10] text-foreground" : "text-foreground/65"
                  }`}
                  style={{ border: 0 }}
                >
                  {server.enabled ? "Active" : "Paused"}
                </button>
              </div>

              <div className="mt-2.5 flex items-center gap-3">
                <State server={server} />
                <span className="text-[11.5px] text-foreground/65">
                  {server.tool_names?.length ?? 0} tools
                </span>
              </div>

              {server.last_error ? (
                <p className="mt-2 line-clamp-2 text-[11.5px] text-destructive/80">{server.last_error}</p>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                {server.state === "needs_auth" ? (
                  <button
                    type="button"
                    onClick={() => void onSignIn(server)}
                    disabled={busyId === server.id}
                    className="h-9 flex-1 rounded-[12px] bg-primary text-[13px] font-medium text-primary-foreground disabled:opacity-60"
                    style={{ border: 0 }}
                  >
                    Sign in
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void onRefresh(server)}
                  disabled={busyId === server.id}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-foreground/[0.06] text-[13px] text-foreground disabled:opacity-60"
                  style={{ border: 0 }}
                >
                  {busyId === server.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void onRemove(server)}
                  disabled={busyId === server.id}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-foreground/[0.06] text-destructive/80 disabled:opacity-60"
                  style={{ border: 0 }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
