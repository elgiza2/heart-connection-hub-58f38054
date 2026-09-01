import { lazy, Suspense, useState } from "react";
import {
  ChevronLeft,
  Code2,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Microscope,
  Music,
  Presentation,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { BrandIcon, hasBrandIcon } from "@/components/chat/media/BrandIcon";
import { findSlidesTemplate } from "@/lib/slidesTemplates";
import type { MediaModelChoice } from "@/components/chat/media/MediaModelPickerSheet";

const MediaModelPickerSheet = lazy(
  () => import("@/components/chat/media/MediaModelPickerSheet"),
);

interface Props {
  chatMode: string;
  mediaModel: MediaModelChoice | null;
  setMediaModel: (m: MediaModelChoice) => void;
  slidesTemplate?: string;
  onOpenTemplatePicker?: () => void;
  onClear: () => void;
  /** Set when the docs agent is active — rendered with the same chip header. */
  isDocsAgent?: boolean;
  /** Set when the dev agent is active — rendered with the same chip header. */
  isDevAgent?: boolean;
}

/** Single source of truth for how every service chip looks/reads. */
const SERVICE_META: Record<
  string,
  { title: string; Icon: React.ElementType }
> = {
  images: { title: "Create image", Icon: ImageIcon },
  video: { title: "Create video", Icon: VideoIcon },
  slides: { title: "Create slides", Icon: Presentation },
  "slides-images": { title: "Create slides", Icon: Presentation },
  code: { title: "Code", Icon: Code2 },
  dev: { title: "Dev", Icon: Code2 },
  "deep-research": { title: "Deep research", Icon: Microscope },
  learning: { title: "Learning", Icon: GraduationCap },
  docs: { title: "Documents", Icon: FileText },
};

function SelectRow({
  icon,
  label,
  onClick,
  ariaLabel,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex-1 min-w-0 flex items-center gap-2 h-11 px-2.5 rounded-2xl border border-foreground/10 bg-foreground/[0.05] hover:bg-foreground/[0.08] active:scale-[0.99] transition text-start"
    >
      <span className="w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-foreground/[0.06]">
        {icon}
      </span>
      <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-foreground">
        {label}
      </span>
      <ChevronLeft className="w-4 h-4 shrink-0 text-foreground/65 rtl:rotate-180" />
    </button>
  );
}

/**
 * The service panel that lives *inside* the composer box while an image /
 * video / slides mode is active: a small titled header with a close button,
 * plus inline selector rows (model, template) so the user never has to leave
 * the input to configure the generation.
 */
export default function ComposerServicePanel({
  chatMode,
  mediaModel,
  setMediaModel,
  slidesTemplate,
  onOpenTemplatePicker,
  onClear,
  isDocsAgent,
  isDevAgent,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const isImages = chatMode === "images";
  const isVideo = chatMode === "video";
  const isSlides = chatMode === "slides" || chatMode === "slides-images";
  const key = isDocsAgent ? "docs" : isDevAgent ? "dev" : chatMode;
  const meta = SERVICE_META[key];
  if (!meta) return null;
  const hasSelector = isImages || isVideo || isSlides;

  const title = meta.title;
  const TitleIcon = meta.Icon;
  const template = isSlides ? findSlidesTemplate(slidesTemplate || "") : null;

  return (
    <div className="pt-2 pb-1.5 space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-foreground/60">
          <TitleIcon className="w-3.5 h-3.5" strokeWidth={2.4} />
          {title}
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Close ${title}`}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.4} />
        </button>
      </div>

      {hasSelector ? (
      <div className="flex items-center gap-2">
        {isSlides ? (
          <SelectRow
            ariaLabel="Choose template"
            onClick={() => onOpenTemplatePicker?.()}
            label={template?.name || "Choose a template"}
            icon={
              template?.cover ? (
                <img
                  src={template.cover}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Presentation className="w-4 h-4 text-foreground/70" />
              )
            }
          />
        ) : (
          <SelectRow
            ariaLabel={isVideo ? "Choose video model" : "Choose image model"}
            onClick={() => setPickerOpen(true)}
            label={
              mediaModel?.name || (isVideo ? "Choose video model" : "Choose image model")
            }
            icon={
              hasBrandIcon(mediaModel?.name, mediaModel?.provider) ? (
                <BrandIcon
                  name={mediaModel?.name}
                  provider={mediaModel?.provider}
                  size={20}
                  variant="color"
                />
              ) : mediaModel?.thumbnail ? (
                <img
                  src={mediaModel.thumbnail}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : isVideo ? (
                <VideoIcon className="w-4 h-4 text-foreground/70" />
              ) : (
                <ImageIcon className="w-4 h-4 text-foreground/70" />
              )
            }
          />
        )}
      </div>
      ) : null}

      {pickerOpen ? (
        <Suspense fallback={null}>
          <MediaModelPickerSheet
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            mode={isVideo ? "video" : "images"}
            selectedSlug={mediaModel?.slug}
            onSelect={(m) => {
              setMediaModel(m);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
