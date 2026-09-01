/** @doc Connected tool servers (Model Context Protocol, 2026-07-28 spec).
 *
 *  Everything here goes through the /api/mcp gateway: the browser never talks
 *  to a tool server directly and never holds its credentials. Servers that
 *  require sign-in are handled with a hosted consent flow; servers that use a
 *  static token accept custom headers instead.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SubShell, SubSection, SubCard } from "@/components/settings/SubShell";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";
import {
  addMcpServer,
  approveMcpTool,
  authorizeMcpServer,
  callMcpTool,
  listMcpServers,
  probeMcpServer,
  removeMcpServer,
  revokeMcpTool,
  updateMcpServer,
  type McpApproval,
  type McpServer,
  type McpToolInfo,
} from "@/lib/mcp/client";

function parseHeaders(text: string): Record<string, string> {
  if (!text.trim()) return {};
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object") return obj as Record<string, string>;
  } catch {
    /* fall through to line parser */
  }
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function StateBadge({ server }: { server: McpServer }) {
  if (server.state === "connected") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-500">
        <CheckCircle2 className="h-3.5 w-3.5" /> Connected
      </span>
    );
  }
  if (server.state === "needs_auth") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-amber-500">
        <Lock className="h-3.5 w-3.5" /> Sign-in required
      </span>
    );
  }
  if (server.state === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-destructive">
        <AlertCircle className="h-3.5 w-3.5" /> Not reachable
      </span>
    );
  }
  return <span className="text-[11.5px] text-muted-foreground">Checking…</span>;
}

export default function McpSettingsPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [approvals, setApprovals] = useState<McpApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [saving, setSaving] = useState(false);

  const [testServer, setTestServer] = useState<McpServer | null>(null);
  const [testTool, setTestTool] = useState("");
  const [testArgs, setTestArgs] = useState("{}");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);

  const approvedSet = useMemo(
    () => new Set(approvals.map((a) => `${a.connection_id}:${a.tool_name}`)),
    [approvals],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMcpServers();
      setServers(res.servers ?? []);
      setApprovals(res.approvals ?? []);
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

  function handleAuthorize(res: { authorize_url?: string }) {
    if (res.authorize_url) {
      window.location.href = res.authorize_url;
      return true;
    }
    return false;
  }

  async function onAdd() {
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
      setAddOpen(false);
      setName("");
      setUrl("");
      setHeadersText("");
      notifyTurnContextChanged();
      if (handleAuthorize(res)) return;
      const count = Array.isArray(res.tools) ? res.tools.length : 0;
      toast.success(count ? `Connected — ${count} tools found` : "Server added");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onRefresh(server: McpServer) {
    setBusyId(server.id);
    try {
      const res = await probeMcpServer(server.id);
      if (handleAuthorize(res)) return;
      if (res.error) toast.error(String(res.error));
      else toast.success(`${Array.isArray(res.tools) ? res.tools.length : 0} tools available`);
      notifyTurnContextChanged();
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onSignIn(server: McpServer) {
    setBusyId(server.id);
    try {
      const res = await authorizeMcpServer(server.id);
      if (handleAuthorize(res)) return;
      toast.error(String(res.error || "This server does not support hosted sign-in"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onToggle(server: McpServer, enabled: boolean) {
    setServers((rows) => rows.map((r) => (r.id === server.id ? { ...r, enabled } : r)));
    try {
      await updateMcpServer(server.id, { enabled });
      notifyTurnContextChanged();
    } catch (err) {
      toast.error((err as Error).message);
      await load();
    }
  }

  async function onRemove(server: McpServer) {
    setBusyId(server.id);
    try {
      await removeMcpServer(server.id);
      notifyTurnContextChanged();
      setServers((rows) => rows.filter((r) => r.id !== server.id));
      toast.success("Removed");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleApproval(server: McpServer, tool: McpToolInfo, approved: boolean) {
    const key = `${server.id}:${tool.name}`;
    try {
      if (approved) {
        await approveMcpTool(server.id, tool.name, "always");
        setApprovals((rows) => [...rows, { connection_id: server.id, tool_name: tool.name, scope: "always" }]);
      } else {
        await revokeMcpTool(server.id, tool.name);
        setApprovals((rows) => rows.filter((r) => `${r.connection_id}:${r.tool_name}` !== key));
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function runTest() {
    if (!testServer || !testTool.trim()) {
      toast.error("Pick a tool first");
      return;
    }
    let args: Record<string, unknown> = {};
    try {
      args = testArgs.trim() ? JSON.parse(testArgs) : {};
    } catch {
      toast.error("Arguments must be valid JSON");
      return;
    }
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await callMcpTool(testServer.id, testTool.trim(), args);
      if (res.needs_approval) {
        await approveMcpTool(testServer.id, testTool.trim(), "always");
        const retry = await callMcpTool(testServer.id, testTool.trim(), args);
        setTestResult(retry.text || JSON.stringify(retry.result ?? retry, null, 2));
        await load();
      } else if (res.ok === false) {
        setTestResult(String(res.error || "Tool call failed"));
      } else {
        setTestResult(res.text || JSON.stringify(res.result ?? res, null, 2));
      }
    } catch (err) {
      setTestResult((err as Error).message);
    } finally {
      setTestRunning(false);
    }
  }

  return (
    <SubShell
      title="Tool servers"
      subtitle="Connect external tool servers so the assistant can act inside them during a chat."
      action={
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add server
        </Button>
      }
    >
      <SubSection
        title="Your servers"
        description="Enabled and connected servers are offered to the assistant on every message."
      >
        {loading ? (
          <SubCard>
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          </SubCard>
        ) : servers.length === 0 ? (
          <SubCard>
            <p className="text-[12.5px] text-muted-foreground">
              No servers yet. Add one to give the assistant extra tools.
            </p>
          </SubCard>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => {
              const tools = server.tools ?? [];
              return (
                <SubCard key={server.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13.5px] font-medium">{server.name}</p>
                        <StateBadge server={server} />
                      </div>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{server.url}</p>
                      {server.last_error && (
                        <p className="mt-1 text-[11.5px] text-destructive">{server.last_error}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Switch
                        checked={server.enabled}
                        onCheckedChange={(v) => void onToggle(server, v)}
                        aria-label="Enable server"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busyId === server.id}
                        onClick={() => void onRefresh(server)}
                        aria-label="Refresh tools"
                      >
                        {busyId === server.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={!tools.length}
                        onClick={() => {
                          setTestServer(server);
                          setTestTool(tools[0]?.name ?? "");
                          setTestArgs("{}");
                          setTestResult(null);
                        }}
                        aria-label="Test a tool"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void onRemove(server)}
                        aria-label="Remove server"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {server.state === "needs_auth" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      disabled={busyId === server.id}
                      onClick={() => void onSignIn(server)}
                    >
                      <Lock className="mr-1.5 h-3.5 w-3.5" /> Sign in to this server
                    </Button>
                  )}

                  {tools.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        <Shield className="h-3 w-3" /> {tools.length} tools · approve the ones that may change data
                      </p>
                      {tools.map((tool) => {
                        const readOnly = Boolean(tool.annotations?.readOnlyHint);
                        const approved = approvedSet.has(`${server.id}:${tool.name}`);
                        return (
                          <div
                            key={tool.name}
                            className="flex items-center justify-between gap-3 rounded-[10px] bg-black/10 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[12.5px]">{tool.title || tool.name}</p>
                              {tool.description && (
                                <p className="truncate text-[11px] text-muted-foreground">{tool.description}</p>
                              )}
                            </div>
                            {readOnly ? (
                              <span className="shrink-0 text-[11px] text-muted-foreground">Read only</span>
                            ) : (
                              <Switch
                                checked={approved}
                                onCheckedChange={(v) => void onToggleApproval(server, tool, v)}
                                aria-label={`Approve ${tool.name}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SubCard>
              );
            })}
          </div>
        )}
      </SubSection>

      {/* Add server */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a tool server</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url">Server URL</Label>
              <Input
                id="mcp-url"
                placeholder="https://example.com/mcp"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-name">Name (optional)</Label>
              <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-headers">Headers (optional)</Label>
              <Textarea
                id="mcp-headers"
                rows={3}
                placeholder={'Authorization: Bearer …\nor {"Authorization": "Bearer …"}'}
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave empty for servers that ask you to sign in — you will be redirected to grant access.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onAdd()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test tool */}
      <Dialog open={Boolean(testServer)} onOpenChange={(open) => !open && setTestServer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test a tool</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="test-tool">Tool</Label>
              <Input id="test-tool" value={testTool} onChange={(e) => setTestTool(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-args">Arguments (JSON)</Label>
              <Textarea id="test-args" rows={4} value={testArgs} onChange={(e) => setTestArgs(e.target.value)} />
            </div>
            {testResult !== null && (
              <pre className="max-h-56 overflow-auto rounded-[10px] bg-black/20 p-3 text-[11.5px] whitespace-pre-wrap">
                {testResult}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestServer(null)}>
              Close
            </Button>
            <Button onClick={() => void runTest()} disabled={testRunning}>
              {testRunning && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SubShell>
  );
}
