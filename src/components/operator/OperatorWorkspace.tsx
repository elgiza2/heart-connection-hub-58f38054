import { PrefetchLink as Link } from "@/components/common/PrefetchLink";
import {
  useOperatorRun,
  startOperatorRun,
  stopOperatorRun,
  type OperatorStep,
  type OperatorMsg,
} from "@/hooks/useOperatorRun";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Square,
  ExternalLink,
  FileText,
  Activity,
  Globe,
  Image as ImageIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AgentStar, { AGENT_COLORS, type AgentKey } from "./AgentStar";
import { useMemo, useState } from "react";
import ImagePreviewModal from "@/components/modals/ImagePreviewModal";

function StepRow({ step }: { step: OperatorStep }) {
  const icon =
    step.status === "done"
      ? CheckCircle2
      : step.status === "failed"
        ? XCircle
        : step.status === "running"
          ? Loader2
          : Clock;
  const cls =
    step.status === "done"
      ? "text-emerald-500"
      : step.status === "failed"
        ? "text-red-500"
        : step.status === "running"
          ? "text-sky-500 animate-spin"
          : "text-muted-foreground";
  const Icon = icon;
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/40">
      <Icon className={`w-4 h-4 mt-0.5 ${cls}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {step.step_no}. {step.title}
        </div>
        {step.tool && <div className="text-[11px] text-muted-foreground">Tool: {step.tool}</div>}
        {step.error && <div className="text-[11px] text-red-500 line-clamp-2">{step.error}</div>}
      </div>
    </div>
  );
}

function AgentMessage({ msg, isActive }: { msg: OperatorMsg; isActive: boolean }) {
  const key = (msg.agent as AgentKey) in AGENT_COLORS ? (msg.agent as AgentKey) : "system";
  const c = AGENT_COLORS[key];
  return (
    <div className="py-2.5 border-b border-border/30">
      <div
        className="flex items-center gap-1.5 text-[11px] font-bold mb-1.5"
        style={{ color: c.color }}
      >
        <AgentStar agent={key} size={14} active={isActive} />
        {c.label}
        {isActive && <span className="text-[10px] font-normal opacity-70">thinking...</span>}
      </div>
      <div className="text-xs whitespace-pre-wrap leading-relaxed text-foreground/90 pl-5">
        {msg.content}
      </div>
    </div>
  );
}

export function OperatorWorkspace({
  runId,
  onClose,
  inline = false,
}: {
  runId: string;
  onClose: () => void;
  inline?: boolean;
}) {
  const { run, steps, messages, artifacts } = useOperatorRun(runId);
  const [tab, setTab] = useState("app");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const isChat = run?.mode === "chat";
  const isRunning = run?.status === "running" || run?.status === "pending";

  // Determine which agent is "active" (the last one that has spoken while still running)
  const activeAgent = useMemo<AgentKey | null>(() => {
    if (!isRunning) return null;
    const phase = run?.current_phase;
    if (
      phase === "ceo" ||
      phase === "coo" ||
      phase === "cto" ||
      phase === "executor" ||
      phase === "chat"
    ) {
      return phase as AgentKey;
    }
    if (phase === "executing") return "executor";
    return null;
  }, [run?.current_phase, isRunning]);

  // For chat-mode: just render the chat response as a normal message — no Task Plan, no tabs.
  if (isChat) {
    const chatMsg = messages.find((m) => m.agent === "assistant");
    return (
      <div
        className={
          inline ? "rounded-2xl border border-border/40 bg-background/60 backdrop-blur p-4" : "p-4"
        }
      >
        <div className="flex items-center gap-2 mb-3">
          <AgentStar agent="assistant" size={18} active={isRunning} />
          <div className="text-sm font-semibold" style={{ color: AGENT_COLORS.assistant.color }}>
            Megsy {isRunning ? "— thinking..." : ""}
          </div>
          {!inline && (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
        {chatMsg ? (
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{chatMsg.content}</div>
        ) : (
          <div className="text-xs text-muted-foreground">Replying...</div>
        )}
      </div>
    );
  }

  // Screenshots and files
  const screenshots = artifacts.filter((a) => a.kind === "image" && a.url);
  const fileArtifacts = artifacts.filter((a) => a.kind !== "image");

  const hasSteps = steps.length > 0;
  const latestBrowser =
    artifacts.find((a) => a.kind === "url")?.url || artifacts.find((a) => a.kind === "image")?.url;

  const containerCls = inline
    ? "grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 rounded-2xl border border-border/40 bg-background/60 backdrop-blur p-3"
    : "grid grid-cols-1 md:grid-cols-[260px_1fr_360px] h-[calc(100vh-120px)] gap-3 p-3";

  return (
    <>
      <div className={containerCls}>
        {/* Task plan — only show when there are real steps */}
        {!inline && (
          <div className="rounded-xl border border-border/50 bg-background/40 backdrop-blur p-3 overflow-hidden flex flex-col">
            {hasSteps ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-amber-600">Task Plan</div>
                  <Badge variant="outline" className="text-[10px]">
                    {run?.status ?? "..."}
                  </Badge>
                </div>
                <ScrollArea className="flex-1">
                  {steps.map((s) => (
                    <StepRow key={s.id} step={s} />
                  ))}
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
                <div className="flex items-center gap-2">
                  <AgentStar agent="ceo" size={14} active />
                  Analyzing...
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-2">
              {isRunning && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => stopOperatorRun(runId)}
                >
                  <Square className="w-3 h-3 mr-1" /> Stop
                </Button>
              )}
              <Button size="sm" variant="ghost" className="flex-1" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Agent timeline */}
        <div
          className={
            inline
              ? "rounded-xl border border-border/40 p-3 flex flex-col min-h-[300px]"
              : "rounded-xl border border-border/50 bg-background/40 backdrop-blur p-3 overflow-hidden flex flex-col"
          }
        >
          <div className="text-xs font-bold mb-2 flex items-center gap-2">
            <AgentStar
              agent={(activeAgent ?? "assistant") as AgentKey}
              size={14}
              active={!!activeAgent}
            />
            Megsy Operator —{" "}
            <span className="opacity-70 font-normal">{run?.current_phase ?? "..."}</span>
          </div>
          {run?.goal && (
            <div className="text-sm font-medium mb-2 px-2 py-1.5 rounded bg-muted/40 line-clamp-2">
              {run.goal}
            </div>
          )}
          <ScrollArea className={inline ? "max-h-[420px] pr-2" : "flex-1 pr-2"}>
            {messages.length === 0 ? (
              <div className="text-xs text-muted-foreground p-4 text-center flex items-center justify-center gap-2">
                <AgentStar agent="ceo" size={14} active />
                Agents Getting ready...
              </div>
            ) : (
              messages.map((m, idx) => {
                const isLast = idx === messages.length - 1;
                const isActiveMsg = isLast && isRunning && m.agent === activeAgent;
                return <AgentMessage key={m.id} msg={m} isActive={isActiveMsg} />;
              })
            )}
            {/* Thinking placeholder for the active agent if no message yet */}
            {isRunning && activeAgent && !messages.some((m) => m.agent === activeAgent) && (
              <div className="py-2.5 border-b border-border/30 flex items-center gap-2">
                <AgentStar agent={activeAgent} size={14} active />
                <span
                  className="text-[11px] font-bold"
                  style={{ color: AGENT_COLORS[activeAgent].color }}
                >
                  {AGENT_COLORS[activeAgent].label}
                </span>
                <span className="text-[11px] opacity-70">thinking...</span>
              </div>
            )}
          </ScrollArea>
          {inline && isRunning && (
            <div className="flex gap-2 mt-2 pt-2 border-t border-border/30">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8"
                onClick={() => stopOperatorRun(runId)}
              >
                <Square className="w-3 h-3 mr-1" /> Stop
              </Button>
            </div>
          )}
        </div>

        {/* Preview tabs */}
        <div
          className={
            inline
              ? "rounded-xl border border-border/40 p-3 flex flex-col min-h-[300px]"
              : "rounded-xl border border-border/50 bg-background/40 backdrop-blur p-3 overflow-hidden flex flex-col"
          }
        >
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
            <TabsList className="grid grid-cols-4 h-8">
              <TabsTrigger value="app" className="text-[11px]">
                <Globe className="w-3 h-3 mr-1" />
                App
              </TabsTrigger>
              <TabsTrigger value="browser" className="text-[11px]">
                <ImageIcon className="w-3 h-3 mr-1" />
                Browser
              </TabsTrigger>
              <TabsTrigger value="files" className="text-[11px]">
                <FileText className="w-3 h-3 mr-1" />
                Files
              </TabsTrigger>
              <TabsTrigger value="log" className="text-[11px]">
                <Activity className="w-3 h-3 mr-1" />
                Log
              </TabsTrigger>
            </TabsList>

            <TabsContent value="app" className="flex-1 mt-2">
              {run?.published_url ? (
                <div className="space-y-2 h-full flex flex-col">
                  <a
                    href={run.published_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-sky-500 flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> {run.published_url}
                  </a>
                  <iframe
                    src={run.published_url}
                    className="flex-1 w-full rounded border border-border/40 min-h-[240px]"
                  />
                </div>
              ) : run?.project_id ? (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-3 text-center p-4">
                  <div className="text-sm font-medium text-foreground">
                    Project is being built in Megsy Code
                  </div>
                  <Link
                    to={`/build/${run.project_id}/chat`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <ExternalLink className="w-3 h-3" /> Open project
                  </Link>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground p-4 text-center">No app yet</div>
              )}
            </TabsContent>

            <TabsContent value="browser" className="flex-1 mt-2 overflow-auto">
              {(run as any)?.live_view_url ? (
                <div className="space-y-2 h-full flex flex-col">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live browser stream
                  </div>
                  <iframe
                    src={(run as any).live_view_url}
                    className="flex-1 w-full rounded border border-border/40 min-h-[320px]"
                    allow="clipboard-read; clipboard-write"
                  />
                </div>
              ) : latestBrowser ? (
                latestBrowser.match(/\.(png|jpg|jpeg|webp)$/i) ? (
                  <img loading="lazy" decoding="async"
                    src={latestBrowser}
                    alt="browser screenshot"
                    className="w-full rounded border border-border/40"
                  />
                ) : (
                  <iframe
                    src={latestBrowser}
                    className="w-full h-full min-h-[240px] rounded border border-border/40"
                  />
                )
              ) : (
                <div className="text-xs text-muted-foreground p-4 text-center">
                  No browsing session yet
                </div>
              )}
            </TabsContent>

            <TabsContent value="files" className="flex-1 mt-2 overflow-auto space-y-2">
              {screenshots.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Screenshots
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {screenshots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setPreviewImageUrl(s.url!)}
                        className="text-left"
                      >
                        <img loading="lazy" decoding="async"
                          src={s.url!}
                          alt="Megsy OS screenshot"
                          className="w-full h-20 object-cover rounded border border-border/40 hover:opacity-80"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {fileArtifacts.length === 0 && screenshots.length === 0 ? (
                <div className="text-xs text-muted-foreground p-4 text-center">No files</div>
              ) : (
                fileArtifacts.map((a) => (
                  <div key={a.id} className="text-[11px] py-1.5 border-b border-border/30">
                    <Badge variant="outline" className="text-[10px] mr-1">
                      {a.kind}
                    </Badge>
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-500 break-all"
                      >
                        {a.url}
                      </a>
                    ) : (
                      <span className="text-muted-foreground line-clamp-2 block mt-1">
                        {a.content?.slice(0, 200)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="log" className="flex-1 mt-2 overflow-auto">
              {steps.length === 0 ? (
                <div className="text-xs text-muted-foreground p-4 text-center">
                  No operations yet
                </div>
              ) : (
                steps.map((s) => (
                  <div
                    key={s.id}
                    className="text-[11px] py-1.5 border-b border-border/30 space-y-0.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          s.status === "done"
                            ? "default"
                            : s.status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                        className="text-[9px] px-1 py-0"
                      >
                        {s.status}
                      </Badge>
                      <span className="font-medium truncate">
                        {s.step_no}. {s.title}
                      </span>
                    </div>
                    {s.tool && <div className="text-muted-foreground text-[10px]">→ {s.tool}</div>}
                    {s.error && (
                      <div className="text-red-500 text-[10px] line-clamp-2">{s.error}</div>
                    )}
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {previewImageUrl && (
        <ImagePreviewModal url={previewImageUrl} onClose={() => setPreviewImageUrl(null)} />
      )}
    </>
  );
}

export async function launchOperator(goal: string): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return await startOperatorRun(goal, user.id);
}
