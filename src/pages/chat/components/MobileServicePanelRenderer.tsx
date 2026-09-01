import {
  FileText,
  GraduationCap,
  Presentation,
  ChevronRight,
  Microscope,
  Image as ImageIcon,
  Video as VideoIcon,
} from "lucide-react";
import { toast } from "sonner";
import MobileServicePanel, {
  ServiceSegmented,
  ServiceRow,
} from "@/components/chat/mobile/MobileServicePanel";
import ModelSettingsBar from "../ModelSettingsBar";
import { findSlidesTemplate } from "@/lib/slidesTemplates";
import type { ChatMode } from "../chatConstants";

export interface MobileServicePanelRendererProps {
  selectedAgent: { id?: string } | null;
  chatMode: ChatMode;
  setChatMode: (m: ChatMode) => void;
  setSelectedAgent: (a: any) => void;
  setSelectedModel: (m: any) => void;
  // slides
  slidesTemplate: string;
  setSlidesPickerOpen: (open: boolean) => void;
  // media
  videoStartEndMode: boolean;
  setVideoStartEndMode: (v: boolean) => void;
  startFrameUrl: string | null;
  endFrameUrl: string | null;
  setStartFrameUrl: (u: string | null) => void;
  setEndFrameUrl: (u: string | null) => void;
  frameUploading: "start" | "end" | null;
  setFrameUploading: (v: "start" | "end" | null) => void;
  uploadFrame: (file: File, opts: any) => Promise<{ url: string }>;
  setVideoDurationSec: (n: any) => void;
  tierMenuOpen: boolean;
  setTierMenuOpen: (v: boolean) => void;
  selectedModel: any;
  megsyTier: any;
  setMegsyTier: (t: any) => void;
  userPlan: any;
  mediaModel: any;
  setMediaModel: (m: any) => void;
  // research
  researchDepth: "pro" | "ultra" | "ultra2x" | "ultra4x" | "ultra8x";
  setResearchDepth: (d: "pro" | "ultra" | "ultra2x" | "ultra4x" | "ultra8x") => void;
}

export function MobileServicePanelRenderer(p: MobileServicePanelRendererProps) {
  const closePanel = () => {
    p.setChatMode("normal" as ChatMode);
    p.setSelectedAgent(null);
    p.setSelectedModel(null);
  };

  if (p.selectedAgent?.id === "docs") {
    // Like images/video — only the single ActiveServicePill strip shows
    // above the input; no full service panel.
    return null;
  }
  if (p.chatMode === "learning") {
    return null;
  }
  if (p.chatMode === "slides" || p.chatMode === "slides-images") {
    // Like deep-research/media — only the single ActiveServicePill strip
    // shows above the input. The template picker button lives INSIDE the
    // composer (via ComposerInlineSlot -> SlidesTemplateButton), replacing
    // the model selector button.
    return null;
  }
  if (p.chatMode === "images" || p.chatMode === "video") {
    // Mobile: model selection + settings live INSIDE the input (via
    // ComposerInlineSlot). The single strip above the input is the
    // ActiveServicePill (name + X) rendered in the input header. So the
    // second, duplicate service panel is intentionally suppressed here.
    return null;
  }
  if (false) {
    const mediaMode: "images" | "video" = p.chatMode === "video" ? "video" : "images";
    const segValue: "images" | "video" | "start-end" =
      p.chatMode === "video" && p.videoStartEndMode ? "start-end" : mediaMode;
    return (
      <MobileServicePanel
        label="Media"
        Icon={mediaMode === "video" ? VideoIcon : ImageIcon}
        onClose={closePanel}
        headerSlot={
          mediaMode === "video" ? (
            <ServiceSegmented
              ariaLabel="Media type"
              value={segValue}
              options={[
                { id: "video", label: "Videos" },
                { id: "start-end", label: "Start + End" },
              ]}
              onChange={(v) => {
                if (v === "start-end") {
                  p.setVideoStartEndMode(true);
                  p.setChatMode("video" as ChatMode);
                } else {
                  p.setVideoStartEndMode(false);
                  p.setChatMode(v as ChatMode);
                }
              }}
            />
          ) : null
        }
      >
        {p.videoStartEndMode && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-foreground/55">
                First &amp; last frame
              </span>
              <span className="text-[10.5px] text-foreground/50">
                {p.startFrameUrl && p.endFrameUrl ? "Ready" : "Both required"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["start", "end"] as const).map((slot) => {
                const url = slot === "start" ? p.startFrameUrl : p.endFrameUrl;
                const busy = p.frameUploading === slot;
                return (
                  <label
                    key={slot}
                    className={`relative flex flex-col items-center justify-center aspect-square rounded-xl border border-dashed text-[10.5px] font-semibold cursor-pointer overflow-hidden transition-all active:scale-[0.98] ${
                      url
                        ? "border-foreground/30 bg-foreground/[0.04]"
                        : "border-foreground/20 bg-foreground/[0.03] hover:bg-foreground/[0.06] text-foreground/65"
                    }`}
                  >
                    {url ? (
                      <>
                        <img loading="lazy" decoding="async"
                          src={url}
                          alt={slot === "start" ? "First frame" : "Last frame"}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-background/80 text-foreground/90 text-[9.5px] uppercase tracking-wider">
                          {slot === "start" ? "Start" : "End"}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            if (slot === "start") p.setStartFrameUrl(null);
                            else p.setEndFrameUrl(null);
                          }}
                          className="absolute top-1.5 right-1.5 w-5 h-5 grid place-items-center rounded-full bg-background/85 text-foreground/80 text-[10px]"
                          aria-label="Remove frame"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-[18px] leading-none mb-1 opacity-70">＋</span>
                        <span>{slot === "start" ? "First frame" : "Last frame"}</span>
                        <span className="text-[9.5px] font-normal opacity-60 mt-0.5">
                          {busy ? "Uploading…" : "Tap to upload"}
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={busy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        p.setFrameUploading(slot);
                        try {
                          const up = await p.uploadFrame(file, { kind: "photo" });
                          if (slot === "start") p.setStartFrameUrl(up.url);
                          else p.setEndFrameUrl(up.url);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Upload failed");
                        } finally {
                          p.setFrameUploading(null);
                        }
                      }}
                    />
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-foreground/55">
              Megsy will interpolate motion between these two frames. Use a model that supports
              first/last frames (e.g. Wan / HappyHorse).
            </p>
          </div>
        )}
        <div className="mt-3">
          <ModelSettingsBar
            mediaMode={mediaMode}
            onSettingsChange={(s) => {
              if (s.duration !== undefined) p.setVideoDurationSec(s.duration);
            }}
            modelMenuProps={{
              mode: p.chatMode,
              open: p.tierMenuOpen,
              onOpenChange: p.setTierMenuOpen,
              side: "top",
              align: "start",
              centerOnMobile: true,
              selectedModel: p.selectedModel,
              megsyTier: p.megsyTier,
              userPlan: p.userPlan,
              mediaModel: p.mediaModel,
              onTierSelect: (tier: any) => {
                p.setSelectedModel(null);
                p.setMegsyTier(tier);
              },
              onChatModelSelect: (m: any) =>
                p.setSelectedModel({ id: m.id, label: m.label, cost: 0 }),
              onMediaModelSelect: p.setMediaModel,
            }}
          />
        </div>
      </MobileServicePanel>
    );
  }
  if (p.chatMode === "deep-research") {
    // Mobile: like images/video — the single strip above the input is the
    // ActiveServicePill (name + X), and the depth options (Lite/Medium/Max)
    // live INSIDE the composer via ComposerInlineSlot, replacing the model
    // selector button. So suppress the full service panel here.
    return null;
  }
  return null;
}
