import { useEffect, useMemo, useState } from "react";
import { Copy, Download, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildProjectPreviewHtml, type ProjectFile } from "@/lib/extractProjectFiles";
import { buildReactRuntimeHtml, isReactProject } from "@/lib/buildReactRuntime";
import { withRuntimeShim } from "@/lib/publishProject";


type SourceLink = { text: string; url: string };

interface ArtifactCanvasProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  files: ProjectFile[];
  images?: string[];
  sources?: SourceLink[];
}

function downloadText(name: string, text: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ArtifactCanvas({
  open,
  onOpenChange,
  content,
  files,
  images = [],
  sources = [],
}: ArtifactCanvasProps) {
  const [activeFile, setActiveFile] = useState(files[0]?.path || "");
  const selectedFile = files.find((f) => f.path === activeFile) || files[0];
  const previewHtml = useMemo(() => {
    const html = buildProjectPreviewHtml(files) || (isReactProject(files) ? buildReactRuntimeHtml(files, "Preview") : null);
    // The iframe is sandboxed without `allow-same-origin`, so storage access
    // throws. Reuse the same shim published sites get, otherwise anything that
    // saves a score/todo/theme crashes here but works after publishing.
    return html ? withRuntimeShim(html) : null;
  }, [files]);

  const defaultTab = files.length ? "preview" : images.length ? "media" : sources.length ? "sources" : "markdown";
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setRuntimeError(null);
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; message?: string } | undefined;
      if (d?.type === "megsy:runtime-error") setRuntimeError(d.message || "Runtime error");
      if (d?.type === "megsy:runtime-ready") setRuntimeError(null);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open, previewHtml]);

  const copy = async (text: string, label = "Copied") => {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[96vw] overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 px-5 py-4 text-left">
            <SheetTitle>Canvas</SheetTitle>
            <SheetDescription>
              {files.length ? `${files.length} files` : images.length ? `${images.length} media items` : "Assistant artifact"}
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border/50 px-4 py-2">
              <TabsList className="h-9">
                {files.length > 0 && <TabsTrigger value="preview">Preview</TabsTrigger>}
                {files.length > 0 && <TabsTrigger value="files">Files</TabsTrigger>}
                {images.length > 0 && <TabsTrigger value="media">Media</TabsTrigger>}
                {sources.length > 0 && <TabsTrigger value="sources">Sources</TabsTrigger>}
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
              </TabsList>
            </div>

            {files.length > 0 && (
              <TabsContent value="preview" className="m-0 min-h-0 flex-1 overflow-auto p-4">
                {runtimeError && (
                  <div className="mb-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 font-semibold">Runtime error</div>
                      <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] opacity-90">{runtimeError}</pre>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("megsy:prefill-composer", {
                          detail: { text: `Fix this runtime error in the project:\n\n${runtimeError}` },
                        }));
                        onOpenChange(false);
                        toast.success("Error sent to the composer");
                      }}

                    >
                      Fix with AI
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { copy(runtimeError, "Error copied"); }}>Copy</Button>
                  </div>
                )}
                {previewHtml ? (
                  <iframe
                    title="Canvas preview"
                    sandbox="allow-scripts allow-forms allow-popups allow-modals"
                    srcDoc={previewHtml}
                    className="h-full min-h-[70vh] w-full rounded-md border border-border bg-background"
                  />
                ) : (
                  <pre className="min-h-[70vh] overflow-auto rounded-md border border-border bg-muted/40 p-4 text-sm">
                    <code>{selectedFile?.content || content}</code>
                  </pre>
                )}
              </TabsContent>
            )}

            {files.length > 0 && (
              <TabsContent value="files" className="m-0 grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[220px_1fr]">
                <div className="overflow-auto border-r border-border/50 p-2">
                  {files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setActiveFile(file.path)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                        selectedFile?.path === file.path ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <span className="block truncate">{file.path}</span>
                    </button>
                  ))}
                </div>
                <div className="flex min-h-0 flex-col">
                  <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{selectedFile?.path}</span>
                    <Button variant="ghost" size="sm" onClick={() => selectedFile && copy(selectedFile.content)}>
                      <Copy className="h-4 w-4" /> Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => selectedFile && downloadText(selectedFile.path.split("/").pop() || "file.txt", selectedFile.content)}
                    >
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4 text-sm">
                    <code>{selectedFile?.content || ""}</code>
                  </pre>
                </div>
              </TabsContent>
            )}

            {images.length > 0 && (
              <TabsContent value="media" className="m-0 min-h-0 flex-1 overflow-auto p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {images.map((src, i) => (
                    <img loading="lazy" decoding="async" key={`${src}-${i}`} src={src} alt="" className="w-full rounded-md border border-border bg-muted object-contain" />
                  ))}
                </div>
              </TabsContent>
            )}

            {sources.length > 0 && (
              <TabsContent value="sources" className="m-0 min-h-0 flex-1 overflow-auto p-4">
                <div className="space-y-2">
                  {sources.map((source, i) => (
                    <a
                      key={`${source.url}-${i}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-md border border-border p-3 text-sm hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1 truncate">{source.text || source.url}</span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </TabsContent>
            )}

            <TabsContent value="markdown" className="m-0 min-h-0 flex-1 overflow-auto p-4">
              <div className="mb-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => copy(content)}>
                  <Copy className="h-4 w-4" /> Copy
                </Button>
                <Button variant="ghost" size="sm" onClick={() => downloadText("artifact.md", content, "text/markdown;charset=utf-8")}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
              <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-sm">
                {content}
              </pre>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}