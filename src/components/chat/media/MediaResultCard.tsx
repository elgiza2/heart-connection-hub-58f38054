import { m as motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Download, Film, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import MegsyStar from "@/components/branding/MegsyStar";

import { ToolLoader } from "@/components/chat/primitives/ToolStatus";
import { SecureVideo } from "@/components/chat/media/SecureVideo";

async function forceDownload(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.message("Opened in a new tab — long-press the video to save it.");
  }
}

export interface MediaSceneResult {
  index: number;
  title: string;
  status: "pending" | "running" | "done" | "error";
  url?: string;
  previewUrl?: string;
  progress?: number;
  taskEndsAt?: number | null;
  error?: string;
  type: "image" | "video";
}

interface Props {
  results: MediaSceneResult[];
  onRetry: (index: number) => void;
  onMergeVideos?: () => void;
  mergeStatus?: "idle" | "merging" | "done" | "error" | "unavailable";
  mergeError?: string;
  finalVideoUrl?: string;
}

export default function MediaResultCard({
  results,
  onRetry,
  onMergeVideos,
  mergeStatus = "idle",
  mergeError,
  finalVideoUrl,
}: Props) {
  const visibleResults = results.filter(
    (r) => r.status === "running" || r.status === "done" || r.status === "error",
  );
  if (!visibleResults.length) return null;

  const isSingle = visibleResults.length === 1;
  const videoDone = results.filter((r) => r.type === "video" && r.status === "done" && r.url);
  const allVideos = results.length > 0 && results.every((r) => r.type === "video");
  const allTerminal = results.every((r) => r.status === "done" || r.status === "error");
  const canMerge = allVideos && allTerminal && videoDone.length >= 2 && !!onMergeVideos;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`my-2 grid max-w-[640px] gap-3 ${
        isSingle ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
      }`}
    >
      <AnimatePresence initial={false}>
        {visibleResults.map((r) => {
          const aspectClass = r.type === "video" ? "aspect-[9/16]" : "aspect-square";

          return (
            <motion.div
              key={r.index}
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="group relative"
            >
              {/* Unified running caption: shared tool icon + loader label */}
              {r.status === "running" && (
                <div className="mb-2 flex items-center gap-2 px-0.5">
                  <ToolLoader label={r.title ? `Generating ${r.title}` : "Generating…"} />
                </div>
              )}

              {/* Tile */}
              <div
                className={`relative w-full flex items-center justify-center overflow-hidden rounded-3xl ${aspectClass} ${
                  r.status === "done" && r.url
                    ? "bg-transparent"
                    : "bg-foreground/[0.045]"
                }`}
              >
                {r.status === "done" && r.url ? (
                  r.type === "video" ? (
                    <>
                      <motion.video
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        src={r.url}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover rounded-3xl"
                      />
                      <GlassDownload
                        onClick={() =>
                          forceDownload(
                            r.url!,
                            `${r.title.replace(/[^\w-]+/g, "_") || `scene-${r.index}`}.mp4`,
                          )
                        }
                      />
                    </>
                  ) : (
                    <>
                      <motion.img
                        initial={{ opacity: 0, scale: 1.01 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        src={r.url}
                        alt={r.title}
                        className="w-full h-full object-cover rounded-3xl"
                      />
                      <GlassDownload
                        onClick={() =>
                          forceDownload(
                            r.url!,
                            `${r.title.replace(/[^\w-]+/g, "_") || `scene-${r.index}`}.png`,
                          )
                        }
                      />
                    </>
                  )
                ) : r.status === "running" ? (
                  <RunningTile progress={r.progress} previewUrl={r.type === "image" ? r.previewUrl : undefined} />
                ) : r.status === "error" ? (
                  <div className="flex flex-col items-center gap-1.5 text-destructive p-3 text-center">
                    <AlertCircle className="w-5 h-5" />
                    <span className="line-clamp-2 text-[11px]">{r.error || "Generation failed"}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] mt-1"
                      onClick={() => onRetry(r.index)}
                    >
                      <RotateCw className="w-3 h-3 me-1" />
                      Retry
                    </Button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* ── Merge into one video ───────────────────────────────────── */}
      {(canMerge || mergeStatus !== "idle" || finalVideoUrl) && (
        <div className="sm:col-span-2 mt-1 rounded-3xl border border-border/60 bg-card/60 backdrop-blur p-3 space-y-2">
          {finalVideoUrl ? (
            <>
              <div className="flex items-center gap-2 text-[12px] font-medium">
                <Film className="w-4 h-4 text-primary" />
                <span>Final stitched video</span>
                <Button
                  size="sm"
                  variant="default"
                  className="ms-auto h-8 gap-1.5"
                  onClick={() => forceDownload(finalVideoUrl, "final-video.mp4")}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </Button>
              </div>
              <SecureVideo
                src={finalVideoUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full rounded-xl bg-background"
              />
            </>
          ) : mergeStatus === "merging" ? (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Stitching {videoDone.length} clips into one video… this can take a minute.
            </div>
          ) : mergeStatus === "unavailable" ? (
            <div className="flex items-start gap-2 text-[12px] text-muted-foreground py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {mergeError ||
                  "Server-side clip merging is not available. Download the clips and merge them locally."}
              </span>
            </div>
          ) : mergeStatus === "error" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[12px] text-destructive">
                <AlertCircle className="w-4 h-4" />
                {mergeError || "Merge failed"}
              </div>
              <Button size="sm" variant="outline" onClick={onMergeVideos}>
                <RotateCw className="w-3.5 h-3.5 me-1" />
                Try merge again
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={onMergeVideos} className="w-full sm:w-auto">
              <Film className="w-3.5 h-3.5 me-1.5" />
              Merge {videoDone.length} clips into one video
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/**
 * ChatGPT-style loading tile:
 *  - Clean surface, no border
 *  - Diagonal shimmer stripes sweeping across
 *  - Soft breathing overlay + optional blurred partial preview
 *  - Thin progress hairline at the bottom
 */
function RunningTile({ progress, previewUrl }: { progress?: number; previewUrl?: string }) {
  return (
    <>
      {previewUrl ? (
        <motion.img
          key={previewUrl}
          src={previewUrl}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: `blur(${Math.max(2, 20 - (progress ?? 0) * 20)}px) saturate(1.05)`,
            transform: "scale(1.04)",
          }}
        />
      ) : null}

      {/* Single soft sweep highlight */}
      <motion.div
        className="absolute inset-y-0 -inset-x-1/2 pointer-events-none"
        style={{
          background:
            "linear-gradient(110deg, transparent 35%, hsl(var(--foreground) / 0.09) 50%, transparent 65%)",
        }}
        animate={{ x: ["-40%", "140%"] }}
        transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
      />

      {!previewUrl && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <motion.span
            className="grid h-11 w-11 place-items-center rounded-full bg-background/50 backdrop-blur-sm"
            animate={{ scale: [1, 1.12, 1], opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity }}
          >
            <MegsyStar className="h-5 w-5 text-[var(--megsy-blue)]" />
          </motion.span>
        </div>
      )}

      {/* Soft breathing overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(65% 65% at 50% 50%, hsl(var(--foreground) / 0.04), transparent 75%)",
        }}
        animate={{ opacity: [0.4, 0.85, 0.4] }}
        transition={{ duration: 2.6, ease: "easeInOut", repeat: Infinity }}
      />

      {/* Thin progress hairline at the bottom */}
      <div className="absolute inset-x-3 bottom-2 h-[2px] overflow-hidden rounded-full bg-foreground/10">
        {Number.isFinite(progress as number) ? (
          <motion.div
            className="h-full bg-foreground/70"
            animate={{ width: `${Math.min(100, Math.max(6, (progress as number) * 100))}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        ) : (
          <motion.div
            className="h-full w-1/3 bg-foreground/70 rounded-full"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
          />
        )}
      </div>
    </>
  );
}

/**
 * Glass download button, floating overlay on bottom-right of the finished media.
 */
function GlassDownload({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.25 }}
      className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-foreground shadow-lg backdrop-blur-xl bg-background/35 hover:bg-background/50 border border-foreground/15 transition-colors"
      aria-label="Download"
    >
      <Download className="w-3.5 h-3.5" />
      Download
    </motion.button>
  );
}
