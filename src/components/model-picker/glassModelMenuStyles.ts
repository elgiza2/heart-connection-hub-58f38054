import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export const glassModelMenuStyle: CSSProperties = {
  background: "rgba(0, 0, 0, 0.32)",
  backdropFilter: "blur(22px) saturate(160%)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  boxShadow:
    "inset 0 1px 1px rgba(255, 255, 255, 0.16), 0 0 0 1px rgba(255, 255, 255, 0.18), 0 22px 60px -18px rgba(0, 0, 0, 0.7)",
};

export const glassModelMenuFullScreenStyle: CSSProperties = {
  background: "hsl(var(--background) / 0.72)",
  backdropFilter: "blur(30px) saturate(185%) brightness(1.04)",
};

export const glassModelMenuTriggerStyle: CSSProperties = {
  background: "transparent",
  boxShadow: "none",
  border: "0px",
};

export const glassModelMenuIconStyle: CSSProperties = {
  background: "hsl(var(--foreground) / 0.1)",
  boxShadow: "inset 1px 1px 1px 0 hsl(var(--foreground) / 0.18)",
};

export const glassModelMenu = {
  panel:
    "z-[9999] rounded-2xl border border-foreground/15 p-2 text-foreground overflow-hidden unified-menu-surface",
  panelScrollable:
    "z-[9999] rounded-2xl border border-foreground/15 p-2 text-foreground overflow-y-auto max-h-[min(520px,calc(100vh-120px))] unified-menu-surface",
  sheetFrame:
    "border-t border-foreground/15 p-2 text-foreground overflow-hidden rounded-[24px] flex flex-col",
  bottomSheet:
    "rounded-t-[28px] border-t border-foreground/15 p-0 text-foreground overflow-hidden",
  triggerPill:
    "inline-flex items-center gap-1.5 h-11 md:h-8 pl-3 pr-2.5 rounded-full border-0 text-foreground/85 hover:text-foreground active:scale-95 transition-all text-[12.5px] font-semibold",
  triggerSegment:
    "group inline-flex h-11 w-full max-w-full items-center gap-2.5 pl-1 pr-3 text-[13px] font-semibold text-white rounded-[18px] border-0 transition active:scale-[0.98]",
  triggerLoose:
    "group inline-flex h-11 md:h-9 max-w-[52vw] items-center gap-2 pl-1 pr-1.5 text-[12.5px] font-semibold text-foreground/90 border-0 hover:text-foreground active:scale-95 transition-all",
  icon:
    "flex shrink-0 items-center justify-center overflow-hidden border border-foreground/12 bg-foreground/[0.08] backdrop-blur-sm",
  sectionLabel:
    "text-[10px] font-black uppercase tracking-[0.22em] text-foreground/55 select-none",
  empty: "px-3 py-6 text-center text-xs text-foreground/55",
  checkDot:
    "shrink-0 grid place-items-center rounded-full bg-brand-action text-brand-ink",
  item: (active = false, className?: string) =>
    cn(
      "group relative flex w-full items-center gap-2.5 rounded-[16px] px-3 py-2.5 text-left transition-all border backdrop-blur-md",
      active
        ? "border-foreground/30 bg-foreground/[0.16] text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)_/_0.16)]"
        : "border-foreground/10 bg-foreground/[0.05] text-foreground/85 hover:bg-foreground/[0.11] hover:border-foreground/20",
      className,
    ),
  depthItem: (active = false) =>
    cn(
      "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold text-left transition-all border backdrop-blur-md",
      active
        ? "border-foreground/30 bg-foreground/[0.16] text-foreground"
        : "border-transparent bg-transparent text-foreground/85 hover:bg-foreground/[0.1] hover:text-foreground",
    ),
  card: (active = false, className?: string) =>
    cn(
      "relative w-full text-left rounded-[18px] p-3 transition-all border backdrop-blur-md",
      active
        ? "border-foreground/30 bg-foreground/[0.16] text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)_/_0.16)]"
        : "border-foreground/10 bg-foreground/[0.05] text-foreground/85 hover:bg-foreground/[0.11] hover:border-foreground/20",
      className,
    ),
};