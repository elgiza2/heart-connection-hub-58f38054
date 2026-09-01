import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Layers, RefreshCw } from "lucide-react";

type MemoryFile = {
  id: string;
  conversation_id: string;
  path: string;
  content: string;
  updated_at: string;
};

type Props = {
  conversationId: string | null;
};

/**
 * Artifacts Canvas — live split-pane viewer for the current conversation's
 * filesystem memory (todo.md / plan.md / notes.md, etc.). Subscribes to
 * agent_memory_files realtime so the agent's writes stream in as they happen.
 */
export function ChatArtifactsCanvas({ conversationId }: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) {
      setFiles([]);
      return;
    }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("agent_memory_files")
      .select("id, conversation_id, path, content, updated_at")
      .eq("conversation_id", conversationId)
      .order("path", { ascending: true });
    setFiles((data ?? []) as MemoryFile[]);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime subscription scoped to this conversation
  useEffect(() => {
    if (!conversationId) return;
    const ch = (supabase as any)
      .channel(`agent_memory_files:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_memory_files",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(ch);
    };
  }, [conversationId, load]);

  const active = useMemo(
    () => files.find((f) => f.path === activePath) ?? files[0] ?? null,
    [files, activePath],
  );

  const count = files.length;

  return (
    <>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-3xl">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              Artifacts
              <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                {count} file{count === 1 ? "" : "s"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 w-7 p-0"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </SheetTitle>
          </SheetHeader>

          {files.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No memory files for this chat yet. They are created automatically when
              the agent writes <code className="font-mono">&lt;agent-write&gt;</code>.
            </div>
          ) : (
            <div className="grid h-[calc(100vh-3.25rem)] grid-cols-[220px_1fr]">
              <div className="overflow-y-auto border-r bg-muted/20 p-2">
                {files.map((f) => {
                  const isActive = (active?.id ?? null) === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setActivePath(f.path)}
                      className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-mono">{f.path}</span>
                      <span className="ml-auto shrink-0 text-[10px] opacity-60">
                        {f.content?.length ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col overflow-hidden">
                {active ? (
                  <>
                    <div className="flex items-center justify-between border-b px-4 py-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-xs">{active.path}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(active.updated_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px] leading-relaxed">
                      {active.content || "(empty)"}
                    </pre>
                  </>
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Choose a file from the list.
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

export default ChatArtifactsCanvas;
