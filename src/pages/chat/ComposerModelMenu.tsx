import { lazy, Suspense, useEffect, useMemo, useRef, useState, useLayoutEffect, type ReactNode } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Lock,
  Sliders,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { promptUpgrade } from "@/lib/upgradeMoment";
import type { AgentModel } from "@/lib/agentRegistry";
import {
  groupModelsByProvider,
  isHiddenMediaModel,
  sortMediaModels,
  useDynamicModels,
} from "@/hooks/useModels";
import { isPaidUser } from "@/lib/subscriptionGating";
import type { MediaModelChoice } from "@/components/chat/media/MediaModelPickerSheet";
import type { ChatMode } from "./chatConstants";
import { CHAT_COMPOSER_MODEL_OPTIONS, ComposerModelIcon, getChatModelDisplayLabel, getEffortPresetsForModel } from "./chatConstants";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BrandIcon, hasBrandIcon } from "@/components/chat/media/BrandIcon";
import { useIsMobile } from "@/hooks/use-mobile";
import { DraggablePlusSheet } from "./components/DraggablePlusSheet";
import {
  glassModelMenu,
  glassModelMenuStyle,
  glassModelMenuTriggerStyle,
} from "@/components/model-picker/glassModelMenuStyles";
import { readChatModelPreferences } from "@/lib/chatModelPreferences";

const ImageToolsBar = lazy(() => import("@/components/chat/media/ImageToolsBar"));
const VideoToolsBar = lazy(() => import("@/components/chat/media/VideoToolsBar"));

const menuContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.012, delayChildren: 0.02 } },
};

const menuItemVariants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: 0.16, ease: "easeOut" as const } },
};

interface Props {
  mode: ChatMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  selectedModel: AgentModel | null;
  megsyTier: "lite" | "pro" | "max";
  userPlan: string;
  mediaModel: MediaModelChoice | null;
  onTierSelect: (tier: "lite" | "pro" | "max") => void;
  onChatModelSelect: (model: { id: string; label: string }) => void;
  onMediaModelSelect: (model: MediaModelChoice) => void;
  onModeChange?: (mode: ChatMode) => void;
  noIcon?: boolean;
  variant?: "pill" | "segment";
  centerOnMobile?: boolean;
  /** Optional settings panel shown in-place when the pinned "Settings" toggle is tapped. */
  settingsPanel?: ReactNode;
  /** Label for the settings view header (defaults to "Settings"). */
  settingsLabel?: string;
  /** Desktop header instances must not create a mobile portal while hidden by CSS. */
  renderMobileSheet?: boolean;
  /** Extra classes for the trigger button. */
  triggerClassName?: string;
}

const asMediaChoice = (model: any, mode: "images" | "video"): MediaModelChoice => ({
  slug: model.slug || model.id,
  name: model.name,
  provider: model.provider,
  credits: Number(model.credits) || 0,
  thumbnail: model.thumbnailUrl || model.iconUrl,
  type: mode === "video" ? "video" : "image",
  isPremium: !!model.isPremium,
});

export default function ComposerModelMenu({
  mode,
  open,
  onOpenChange,
  side = "bottom",
  align = "end",
  selectedModel,
  megsyTier,
  userPlan,
  mediaModel,
  onTierSelect,
  onChatModelSelect,
  onMediaModelSelect,
  onModeChange,
  noIcon = false,
  variant = "pill",
  settingsPanel,
  settingsLabel = "Settings",
  renderMobileSheet = true,
  triggerClassName,
}: Props) {
  const [view, setView] = useState<"models" | "more" | "settings">("models");
  const [effortValue, setEffortValue] = useState<string>(() => {
    try { return readChatModelPreferences().effort; } catch { return "medium"; }
  });
  const [mobileHeaderHidden, setMobileHeaderHidden] = useState(false);
  const mobileLastScrollTopRef = useRef(0);
  useEffect(() => {
    if (!open) setView("models");
    if (open) {
      try { setEffortValue(readChatModelPreferences().effort); } catch {}
      setMobileHeaderHidden(false);
      mobileLastScrollTopRef.current = 0;
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.effort) setEffortValue(detail.effort);
    };
    window.addEventListener("megsy:chat-model-preferences", handler);
    return () => window.removeEventListener("megsy:chat-model-preferences", handler);
  }, [open]);
  const isMediaMode = mode === "images" || mode === "video";
  const paid = isPaidUser(userPlan);
  const isMobile = useIsMobile();
  const { models: dynamicModels, loading } = useDynamicModels();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<
    { left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null
  >(null);
  const MENU_W = typeof window !== "undefined" && window.innerWidth < 640 ? 260 : 300;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = vw < 640;
      const menuW = isMobile ? Math.min(260, vw - 24) : Math.min(MENU_W, vw - 24);
      let left = r.left;
      if (align === "end") left = r.right - menuW;
      else if (align === "center") left = r.left + (r.width - menuW) / 2;
      left = Math.max(12, Math.min(vw - menuW - 12, left));
      const width = menuW;
      const cap = isMobile ? Math.min(vh * 0.55, 420) : Math.min(vh * 0.7, 560);
      // Auto-flip: if the trigger sits in the lower part of the screen (composer),
      // the menu should rise above it instead of being pushed off-screen below.
      const placeAbove = side === "top" || r.bottom > vh * 0.55;
      if (placeAbove) {
        const bottom = vh - r.top + 10;
        const maxHeight = Math.min(cap, Math.max(220, r.top - 24));
        setPos({ left, width, bottom, maxHeight });
      } else {
        const top = r.bottom + 10;
        const maxHeight = Math.min(cap, Math.max(220, vh - top - 24));
        setPos({ left, width, top, maxHeight });
      }

    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align, side]);

  const mediaOptions = useMemo(() => {
    if (!isMediaMode) return [];
    const target = mode === "video" ? ["video", "video-i2v"] : ["image"];
    return sortMediaModels(
      dynamicModels.filter((model) => target.includes(model.type as string) && !isHiddenMediaModel(model)),
      mode === "video" ? "video" : "images",
    );
  }, [dynamicModels, isMediaMode, mode]);

  // Unified lists for the mobile sheet — always available regardless of current mode.
  const imageOptions = useMemo(
    () =>
      sortMediaModels(
        dynamicModels.filter((m) => (m.type as string) === "image" && !isHiddenMediaModel(m)),
        "images",
      ),
    [dynamicModels],
  );
  const videoOptions = useMemo(
    () =>
      sortMediaModels(
        dynamicModels.filter((m) => ["video", "video-i2v"].includes(m.type as string) && !isHiddenMediaModel(m)),
        "video",
      ),
    [dynamicModels],
  );

  const orderedChatOptions = useMemo(
    () => [...CHAT_COMPOSER_MODEL_OPTIONS].sort((a, b) => Number(a.premium) - Number(b.premium)),
    [],
  );
  const orderedImageOptions = useMemo(
    () => imageOptions,
    [imageOptions],
  );
  const orderedVideoOptions = useMemo(
    () => videoOptions,
    [videoOptions],
  );

  const visibleImageOptions = view === "more" ? orderedImageOptions : orderedImageOptions.slice(0, 4);
  const visibleVideoOptions = view === "more" ? orderedVideoOptions : orderedVideoOptions.slice(0, 4);
  const groupedMediaOptions = useMemo(() => groupModelsByProvider(mediaOptions), [mediaOptions]);

  const resetMobileHeader = () => {
    setMobileHeaderHidden(false);
    mobileLastScrollTopRef.current = 0;
  };

  useEffect(() => {
    if (!isMediaMode || loading || mediaOptions.length === 0) return;
    if (mediaModel?.type === (mode === "video" ? "video" : "image")) return;
    const defaultModel = paid ? mediaOptions[0] : mediaOptions.find((m) => !(m as any).isPremium) || mediaOptions[0];
    onMediaModelSelect(asMediaChoice(defaultModel, mode));
  }, [isMediaMode, loading, mediaModel?.type, mediaOptions, mode, onMediaModelSelect, paid]);

  useEffect(() => {
    resetMobileHeader();
  }, [open, view]);

  const activeChatOption = CHAT_COMPOSER_MODEL_OPTIONS.find((item) =>
    item.kind === "tier" ? !selectedModel && megsyTier === item.id : selectedModel?.id === item.id,
  );
  const triggerLabel = isMediaMode
    ? mediaModel?.name ||
      (loading ? "Loading models" : mode === "video" ? "Video model" : "Image model")
    : activeChatOption?.label || getChatModelDisplayLabel(selectedModel, megsyTier);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        data-tier-trigger
        className={
          variant === "segment"
            ? `${glassModelMenu.triggerSegment} justify-center ${triggerClassName || ""}`
            : `group inline-flex h-11 md:h-9 max-w-[62vw] items-center justify-center gap-1 rounded-full px-1 text-[16px] font-semibold text-foreground hover:text-foreground active:scale-95 transition-all outline-none ${triggerClassName || ""}`
        }
        style={
          variant === "segment"
            ? glassModelMenuTriggerStyle
            : { background: "transparent", border: 0, boxShadow: "none", minHeight: 44 }
        }
        aria-label="Choose model"
        aria-expanded={open}
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-foreground/70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
        {!noIcon && !(variant === "pill" && isMediaMode) && (
          <span data-model-icon className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-transparent border-0">
            {isMediaMode ? (
              hasBrandIcon(mediaModel?.name, mediaModel?.provider) ? (
                <BrandIcon name={mediaModel?.name} provider={mediaModel?.provider} size={24} />
              ) : mediaModel?.thumbnail ? (
                <img loading="lazy" decoding="async" src={mediaModel.thumbnail} alt="" className="h-full w-full object-cover" />
              ) : mode === "video" ? (
                <VideoIcon className="h-3.5 w-3.5 text-foreground/85" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5 text-foreground/85" />
              )
            ) : activeChatOption ? (
              <ComposerModelIcon brand={activeChatOption.brand} />
            ) : (
              <BrandLogo
                alt=""
                className="h-[68%] w-[68%]"
                loading="lazy"
                decoding="async"
              />
            )}
          </span>
        )}
        <span data-model-label className="truncate tracking-tight text-foreground">{triggerLabel}</span>
      </button>

      {/* MOBILE (chat) — anchored dropdown card */}
      {renderMobileSheet && isMobile && !isMediaMode && typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => onOpenChange(false)} />
                <motion.div
                  data-tier-menu
                  initial={{ opacity: 0, y: pos.bottom != null ? 10 : -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: pos.bottom != null ? 10 : -10, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.6 }}
                  style={{
                    position: "fixed",
                    ...(pos.bottom != null
                      ? { bottom: Math.max(10, pos.bottom) }
                      : { top: Math.max(10, pos.top ?? 60) }),
                    left: Math.max(12, Math.min(pos.left ?? 12, window.innerWidth - (pos.width ?? 260) - 12)),
                    width: pos.width ?? 260,
                    maxHeight: pos.maxHeight,
                    background: "var(--chat-claude-composer, #262627)",
                    border: 0,
                    backdropFilter: "none",
                    WebkitBackdropFilter: "none",
                    boxShadow: "none",
                    transformOrigin: pos.bottom != null ? "bottom center" : "top center",
                  }}
                  className="tier-menu-card z-[9999] flex flex-col overflow-y-auto overscroll-contain rounded-[26px] p-1.5"
                >
                  <div className="px-3 pb-1.5 pt-2 text-[11px] font-medium tracking-wide text-foreground/65">
                    Choose a model
                  </div>

                  {CHAT_COMPOSER_MODEL_OPTIONS.map((item, idx) => {
                    const locked = item.premium && (userPlan === "free" || userPlan === "trial");
                    const active =
                      item.kind === "tier"
                        ? !selectedModel && megsyTier === item.id
                        : selectedModel?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (locked) {
                            toast.info(`${item.label} is available on paid plans only`);
                            return;
                          }
                          if (item.kind === "tier") onTierSelect(item.id as "lite" | "pro" | "max");
                          else onChatModelSelect({ id: (item as any).id, label: (item as any).label });
                          onOpenChange(false);
                        }}
                        style={{
                          background: active
                            ? "rgba(255,255,255,0.035)"
                            : "transparent",
                          border: 0,
                          boxShadow: "none",
                          marginTop: 0,
                          opacity: locked ? 0.5 : 1,
                        }}
                        className="flex w-full items-center gap-2.5 rounded-[20px] px-3 py-2.5 text-right transition-colors tier-row active:scale-[0.985]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`truncate text-[14px] leading-tight ${
                                active ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                              }`}
                            >
                              {item.label}
                            </span>
                            {item.premium && (
                              <span className="shrink-0 rounded-md bg-foreground/[0.07] px-1.5 py-[2px] text-[9px] font-semibold leading-none text-foreground/50">
                                Pro
                              </span>
                            )}
                          </span>
                          <span className="mt-[3px] block truncate text-[11px] leading-snug text-foreground/65">
                            {item.desc}
                          </span>
                        </span>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          {locked ? (
                            <Lock className="h-3.5 w-3.5 text-foreground/65" />
                          ) : active ? (
                            <Check className="h-[17px] w-[17px] text-primary" strokeWidth={2.8} />
                          ) : null}
                        </span>
                      </button>
                    );

                  })}

                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* MOBILE — unified bottom-sheet (Chat + Images + Videos) */}
      {renderMobileSheet && isMobile && isMediaMode && typeof document !== "undefined" &&

        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="md:hidden fixed inset-0 z-[55] bg-transparent"
                  onClick={() => onOpenChange(false)}
                />
                <DraggablePlusSheet
                   height={(() => {
                     const allRows = mode === "images" ? orderedImageOptions.length : mode === "video" ? orderedVideoOptions.length : orderedChatOptions.length;
                     const HEADER = 60;
                     const ROW = 68;
                     const PAD = 40;
                     let rows: number;
                     if (view === "settings") {
                       // Model settings, media settings, and deep-research depth panels
                       // are compact — pick the fewest rows we need.
                       if ((mode as ChatMode) === "deep-research") rows = 5;
                       else if (mode === "images" || mode === "video") rows = 4;
                       else rows = 4; // 3 effort + 1 deep-thinking toggle
                     } else if (view === "more") {
                       rows = allRows;
                     } else {
                       // main models view: up to 4 model rows + a small trailing card (~2 rows)
                       rows = Math.min(allRows, 4) + 2;
                     }
                     const estimated = HEADER + rows * ROW + PAD;
                     const maxH = typeof window !== "undefined" ? window.innerHeight * 0.88 : 650;
                     return Math.min(estimated, maxH, 720);
                  })()}
                  collapsedY={0}
                  onClose={() => onOpenChange(false)}
                  initialExpanded
                  view={view}
                  onScroll={(e) => {
                    const current = e.currentTarget.scrollTop;
                    const prev = mobileLastScrollTopRef.current;
                    if (current <= 2) setMobileHeaderHidden(false);
                    else if (current > prev + 4) setMobileHeaderHidden(true);
                    else if (current < prev - 4) setMobileHeaderHidden(false);
                    mobileLastScrollTopRef.current = current;
                  }}
                >

                  <div className="px-3 pt-1 pb-4 text-foreground">
                    <div className={`sticky top-0 z-10 mb-3 flex h-11 items-center justify-between bg-transparent px-1 transition-transform duration-300 ${mobileHeaderHidden ? "-translate-y-[120%]" : "translate-y-0"}`}>
                      <button type="button" onClick={() => {
                        resetMobileHeader();
                        if (view === "models") onOpenChange(false);
                        else setView("models");
                      }} className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/[0.06] hover:bg-foreground/[0.09] transition-colors" aria-label={view === "models" ? "Close" : "Back"}>
                        {view === "models" ? <X className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
                      </button>
                      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.p
                            key={view}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="text-[16px] font-semibold"
                          >
                            {view === "settings"
                              ? ((mode as ChatMode) === "deep-research"
                                  ? "Depth"
                                  : mode !== "images" && mode !== "video"
                                    ? "Effort"
                                    : settingsLabel)
                              : view === "more"
                                ? "More models"
                                : "Select model"}
                          </motion.p>
                        </AnimatePresence>
                      </div>
                      <span className="h-9 w-9" aria-hidden="true" />
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                      {view === "settings" && settingsPanel ? (
                        <motion.div
                          key="settings"
                          initial={{ opacity: 0, x: 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -16 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                          {settingsPanel}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="models"
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        >

                    {/* Chat models — shown only when in chat mode */}
                    {mode !== "images" && mode !== "video" && (
                    <div className="mb-4">
                      <div className="flex flex-col rounded-2xl bg-foreground/[0.02] overflow-hidden">

                        {(view === "more" ? orderedChatOptions : orderedChatOptions.slice(0, 4)).map((item) => {
                          const locked =
                            item.premium && (userPlan === "free" || userPlan === "trial");
                          const active =
                            item.kind === "tier"
                              ? !selectedModel && megsyTier === item.id
                              : selectedModel?.id === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                if (locked) {
                                  promptUpgrade(item.label);
                                  return;
                                }

                                if (item.kind === "tier")
                                  onTierSelect(item.id as "lite" | "pro" | "max");
                                else
                                  onChatModelSelect({ id: (item as any).id, label: (item as any).label });
                                toast.success(`Selected: ${item.label}`);
                                onOpenChange(false);
                              }}
                              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${active ? "bg-foreground/[0.035]" : "hover:bg-foreground/[0.02]"}`}
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground/[0.05]">
                                <ComposerModelIcon brand={item.brand} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[14.5px] font-semibold leading-tight truncate tracking-tight">
                                  {item.label}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] leading-snug text-foreground/55">
                                  {item.desc}
                                </span>
                              </span>
                              <span className="shrink-0 w-5 flex items-center justify-end">
                                {locked ? (
                                  <Lock className="h-4 w-4 text-foreground/65" />
                                ) : active ? (
                                  <Check className="h-5 w-5" strokeWidth={2.75} style={{ color: "hsl(var(--primary))" }} />
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    )}

                    {/* Image models — shown only when in images mode */}
                    {mode === "images" && (
                    <div className="mb-4">
                      <MediaModelTools mode="images" />
                      {visibleImageOptions.length === 0 ? (
                        <p className="rounded-2xl bg-foreground/[0.02] px-3 py-3 text-[12.5px] text-foreground/50">
                          {loading ? "Loading models…" : "No models available."}
                        </p>
                      ) : (
                        <div className="flex flex-col rounded-2xl bg-foreground/[0.02] overflow-hidden">
                          {visibleImageOptions.map((model) => {
                            const choice = asMediaChoice(model, "images");
                            const active = mode === "images" && mediaModel?.slug === choice.slug;
                            const locked = !!(model as any).isPremium && !paid;
                            return (
                              <button
                                key={choice.slug}
                                onClick={() => {
                                  if (locked) {
                                    promptUpgrade(choice.name);
                                    return;
                                  }
                                  if (mode !== "images") onModeChange?.("images");
                                  onMediaModelSelect(choice);
                                  toast.success(`Selected: ${choice.name}`);
                                  onOpenChange(false);
                                }}
                                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${active ? "bg-foreground/[0.035]" : "hover:bg-foreground/[0.02]"}`}
                              >
                                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground/[0.05]">
                                  {hasBrandIcon(choice.name, choice.provider) ? (
                                    <BrandIcon name={choice.name} provider={choice.provider} size={30} />
                                  ) : choice.thumbnail ? (
                                    <img loading="lazy" decoding="async" src={choice.thumbnail} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <ImageIcon className="h-4 w-4 text-foreground/60" />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold leading-tight tracking-tight">
                                  {choice.name}
                                </span>
                                <span className="shrink-0 w-5 flex items-center justify-end">
                                  {locked ? (
                                    <Lock className="h-4 w-4 text-foreground/65" />
                                  ) : active ? (
                                    <Check className="h-5 w-5" strokeWidth={2.75} style={{ color: "hsl(var(--primary))" }} />
                                  ) : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    )}

                    {/* Video models — shown only when in video mode */}
                    {mode === "video" && (
                    <div className="mb-2">
                      <MediaModelTools mode="video" />
                      {visibleVideoOptions.length === 0 ? (
                        <p className="rounded-2xl bg-foreground/[0.02] px-3 py-3 text-[12.5px] text-foreground/50">
                          {loading ? "Loading models…" : "No models available."}
                        </p>
                      ) : (
                        <div className="flex flex-col rounded-2xl bg-foreground/[0.02] overflow-hidden">
                          {visibleVideoOptions.map((model) => {
                            const choice = asMediaChoice(model, "video");
                            const active = mode === "video" && mediaModel?.slug === choice.slug;
                            const locked = !!(model as any).isPremium && !paid;
                            return (
                              <button
                                key={choice.slug}
                                onClick={() => {
                                  if (locked) {
                                    promptUpgrade(choice.name);
                                    return;
                                  }
                                  if (mode !== "video") onModeChange?.("video");
                                  onMediaModelSelect(choice);
                                  toast.success(`Selected: ${choice.name}`);
                                  onOpenChange(false);
                                }}
                                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${active ? "bg-foreground/[0.035]" : "hover:bg-foreground/[0.02]"}`}
                              >
                                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground/[0.05]">
                                  {hasBrandIcon(choice.name, choice.provider) ? (
                                    <BrandIcon name={choice.name} provider={choice.provider} size={30} />
                                  ) : choice.thumbnail ? (
                                    <img loading="lazy" decoding="async" src={choice.thumbnail} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <VideoIcon className="h-4 w-4 text-foreground/60" />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold leading-tight tracking-tight">
                                  {choice.name}
                                </span>
                                <span className="shrink-0 w-5 flex items-center justify-end">
                                  {locked ? (
                                    <Lock className="h-4 w-4 text-foreground/65" />
                                  ) : active ? (
                                    <Check className="h-5 w-5" strokeWidth={2.75} style={{ color: "hsl(var(--primary))" }} />
                                  ) : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    )}
                    {view === "models" && (
                      <div className="mt-3 flex flex-col rounded-2xl bg-foreground/[0.02] overflow-hidden">
                        {settingsPanel ? (
                          <button type="button" onClick={() => setView("settings")} className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-foreground/[0.02] transition-colors">
                            <span className="flex-1 text-[14.5px] font-semibold">
                              {(mode as ChatMode) === "deep-research"
                                ? "Depth"
                                : mode !== "images" && mode !== "video"
                                  ? "Effort"
                                  : settingsLabel}
                            </span>
                            {mode !== "images" && mode !== "video" && (mode as ChatMode) !== "deep-research" ? (
                              <span className="text-[13.5px] text-foreground/55">
                                {getEffortPresetsForModel(selectedModel?.id ?? "lite").find((p) => p.id === effortValue)?.label ?? ""}
                              </span>
                            ) : null}
                            <ChevronRight className="h-4 w-4 text-foreground/65" />
                          </button>
                        ) : null}
                        {(mode === "images" ? orderedImageOptions.length : mode === "video" ? orderedVideoOptions.length : orderedChatOptions.length) > 4 ? (
                          <button type="button" onClick={() => setView("more")} className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-foreground/[0.02] transition-colors">
                            <span className="flex-1 text-[14.5px] font-semibold">More models</span>
                            <ChevronRight className="h-4 w-4 text-foreground/65" />
                          </button>
                        ) : null}
                      </div>
                    )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>


                </DraggablePlusSheet>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* DESKTOP — floating dropdown */}
      {!isMobile && typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <>
                <div
                  className="fixed inset-0 z-[9998]"
                  onClick={() => onOpenChange(false)}
                />
                <motion.div
                  data-tier-menu
                  initial={{ opacity: 0, y: side === "top" ? 8 : -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: side === "top" ? 8 : -8, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.6 }}
                  style={{
                    position: "fixed",
                    left: pos.left,
                    width: pos.width,
                    ...(pos.top !== undefined ? { top: pos.top } : {}),
                    ...(pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
                    maxHeight: pos.maxHeight,
                    scrollBehavior: "smooth",
                    background: "var(--chat-claude-composer, #262627)",
                    border: 0,
                    backdropFilter: "none",
                    WebkitBackdropFilter: "none",
                    boxShadow: "none",
                  }}
                  className="z-[9999] rounded-2xl p-2 text-foreground overflow-y-auto overscroll-contain unified-menu-surface scrollbar-thin"
                >

                  {settingsPanel && (
                    <div className="flex items-center justify-between gap-2 px-1.5 pt-0.5 pb-2 sticky top-0 z-10">
                      <button
                        type="button"
                        onClick={() => setView(view === "settings" ? "models" : "settings")}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-foreground/90 bg-foreground/[0.06] hover:bg-foreground/[0.09] transition-colors"
                        aria-label={view === "settings" ? "Back to models" : "Open model settings"}
                      >
                        {view === "settings" ? (
                          <>
                            <ArrowLeft className="h-3 w-3" strokeWidth={2.4} />
                            <span>Models</span>
                          </>
                        ) : (
                          <>
                            <Sliders className="h-3 w-3" strokeWidth={2.4} />
                            <span>{settingsLabel}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  <AnimatePresence mode="wait" initial={false}>
                  {view === "settings" && settingsPanel ? (
                    <motion.div
                      key="settings-desktop"
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="p-1"
                    >
                      {settingsPanel}
                    </motion.div>
                  ) : (
                  <motion.div
                    key="models-desktop"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                  {isMediaMode ? (

                    mediaOptions.length === 0 ? (
                      <div className={glassModelMenu.empty}>
                        {loading ? "Loading models…" : "No models available."}
                      </div>
                    ) : (
                      <>
                        <MediaModelTools mode={mode === "video" ? "video" : "images"} />
                        <div className="px-2.5 pt-1.5 pb-1.5 flex items-center gap-3 whitespace-nowrap">
                          <span className={glassModelMenu.sectionLabel}>
                            {mode === "video" ? "Video models" : "Image models"}
                          </span>
                        </div>
                        <motion.div
                          variants={menuContainerVariants}
                          initial="hidden"
                          animate="show"
                          className="flex flex-col gap-2"
                        >
                          {groupedMediaOptions.map((group) => (
                            <div key={group.provider}>
                              <div className="px-2.5 pb-1 text-[10px] font-black uppercase tracking-wider text-foreground/65">
                                {group.label}
                              </div>
                              <div className="flex flex-col gap-1">
                                {group.models.map((model) => {
                                  const choice = asMediaChoice(model, mode);
                                  const active = mediaModel?.slug === choice.slug;
                                  const locked = !!model.isPremium && !paid;
                                  return (
                                    <motion.button
                                      key={choice.slug}
                                      variants={menuItemVariants}
                                      onClick={() => {
                                        if (locked) {
                                          promptUpgrade(choice.name);
                                          return;
                                        }
                                        onMediaModelSelect(choice);
                                        toast.success(`Selected: ${choice.name}`);
                                        onOpenChange(false);
                                      }}
                                      className={`group relative flex w-full items-center gap-2.5 rounded-ios-md px-3 py-2.5 text-left transition-colors border border-transparent text-foreground/90 hover:text-foreground ${active ? "bg-foreground/[0.035]" : "bg-transparent hover:bg-foreground/[0.02]"}`}
                                    >
                                      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-transparent">
                                        <BrandIcon name={choice.name} provider={choice.provider} size={28} />
                                        {!hasBrandIcon(choice.name, choice.provider) &&
                                          (choice.thumbnail ? (
                                            <img loading="lazy" decoding="async" src={choice.thumbnail} alt="" className="h-full w-full object-cover" />
                                          ) : mode === "video" ? (
                                            <VideoIcon className="h-4 w-4 text-foreground/80" />
                                          ) : (
                                            <ImageIcon className="h-4 w-4 text-foreground/80" />
                                          ))}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight tracking-tight text-foreground">
                                        {choice.name}
                                      </span>
                                      {locked ? (
                                        <Lock className="h-3.5 w-3.5 shrink-0 text-foreground/55" />
                                      ) : active ? (
                                        <span className={`${glassModelMenu.checkDot} h-4 w-4`}>
                                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                                        </span>
                                      ) : null}
                                    </motion.button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      </>
                    )
                  ) : (
                    <div className="flex flex-col gap-1">
                      {CHAT_COMPOSER_MODEL_OPTIONS.map((item) => {
                        const locked = item.premium && (userPlan === "free" || userPlan === "trial");
                        const active =
                          item.kind === "tier"
                            ? !selectedModel && megsyTier === item.id
                            : selectedModel?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              if (locked) {
                                promptUpgrade(item.label);
                                return;
                              }
                              if (item.kind === "tier") onTierSelect(item.id as "lite" | "pro" | "max");
                              else onChatModelSelect({ id: (item as any).id, label: (item as any).label });
                              toast.success(`Selected: ${item.label}`);
                              onOpenChange(false);
                            }}
                            className={`group relative flex w-full items-center gap-3 rounded-ios-md px-3 py-2.5 text-left transition-colors border border-transparent text-foreground/90 hover:text-foreground ${active ? "bg-foreground/[0.035]" : "bg-transparent hover:bg-foreground/[0.02]"}`}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-transparent">
                              <ComposerModelIcon brand={item.brand} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold leading-tight truncate tracking-tight text-foreground">
                                {item.label}
                              </span>
                            </span>
                            <span className="shrink-0 w-5 flex items-center justify-end">
                              {locked ? (
                                <Lock className="h-4 w-4 text-foreground/55" />
                              ) : active ? (
                                <span className={`${glassModelMenu.checkDot} h-5 w-5`}>
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
          )}
                  </motion.div>
                  )}
                  </AnimatePresence>
        </motion.div>

      </>
    )}
  </AnimatePresence>,
  document.body,
)}
    </div>
  );
}

function MediaModelTools({ mode }: { mode: "images" | "video" }) {
  return (
    <div className="mb-3 rounded-2xl bg-foreground/[0.02] p-1">
      <Suspense fallback={null}>
        {mode === "video" ? (
          <VideoToolsBar />
        ) : (
          <ImageToolsBar
            onAttach={(file) =>
              window.dispatchEvent(new CustomEvent("megsy:image-tool-attach", { detail: file }))
            }
            onUseCharacter={(character) =>
              window.dispatchEvent(new CustomEvent("megsy:image-tool-character", { detail: character }))
            }
          />
        )}
      </Suspense>
    </div>
  );
}

