import * as React from "react";
import { Drawer as Vaul } from "vaul";
import { cn } from "@/lib/utils";

/**
 * GlassSheet — bottom sheet with a clean, solid surface (no glass blur).
 * Implemented on top of `vaul` (Emil Kowalski) so it keeps native rubber-band
 * drag, momentum, snap-to-dismiss, and iOS-grade spring physics.
 */

interface GlassSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  snapPoints?: Array<number | string>;
  activeSnapPoint?: number | string | null;
  setActiveSnapPoint?: (snapPoint: number | string | null) => void;
  fadeFromIndex?: number;
}

export function GlassSheet({
  open,
  onOpenChange,
  children,
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  fadeFromIndex,
}: GlassSheetProps) {
  return (
    <Vaul.Root
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      // Tighter resistance for "iOS rubber-band" feel
      closeThreshold={0.3}
      snapPoints={snapPoints}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
      fadeFromIndex={fadeFromIndex as never}
      snapToSequentialPoint
    >
      {children}
    </Vaul.Root>
  );
}

export const GlassSheetTrigger = Vaul.Trigger as unknown as React.ForwardRefExoticComponent<
  React.ButtonHTMLAttributes<HTMLButtonElement> & React.RefAttributes<HTMLButtonElement>
>;

export const GlassSheetClose = Vaul.Close as unknown as React.ForwardRefExoticComponent<
  React.ButtonHTMLAttributes<HTMLButtonElement> & React.RefAttributes<HTMLButtonElement>
>;

export const GlassSheetPortal = ({ children }: { children: React.ReactNode }) => (
  <Vaul.Portal>{children}</Vaul.Portal>
);

export const GlassSheetOverlay = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <Vaul.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-overlay bg-background/60", className)}
    {...props}
  />
));
GlassSheetOverlay.displayName = "GlassSheetOverlay";

interface GlassSheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  showHandle?: boolean;
  contentClassName?: string;
  overlayClassName?: string;
}

export const GlassSheetContent = React.forwardRef<HTMLDivElement, GlassSheetContentProps>(
  (
    { className, contentClassName, overlayClassName, children, showHandle = true, ...props },
    ref,
  ) => {
    return (
      <Vaul.Portal>
        <Vaul.Overlay className={cn("fixed inset-0 z-overlay bg-background/60", overlayClassName)} />
        <Vaul.Content
          ref={ref}
          className={cn(
            "fixed inset-x-0 bottom-0 z-modal bg-card pb-[env(safe-area-inset-bottom)]",
            "mt-24 flex h-auto max-h-[88dvh] flex-col overflow-hidden rounded-t-[2.5rem] outline-none",
            "border-t border-border",
            "shadow-[0_-20px_50px_-12px_rgba(0,0,0,0.5)]",
            "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-foreground/20 before:to-transparent",
            "glass-sheet-content",
            className,
          )}
          {...props}
        >
          {showHandle && (
            <div className="mx-auto mt-3 mb-2 h-1.5 w-12 shrink-0 rounded-full bg-foreground/25" />
          )}
          <div
            className={cn(
              "flex-1 overflow-y-auto overscroll-contain px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] text-foreground",
              contentClassName,
            )}
          >
            {children}
          </div>
          {/* Overdrag filler — keeps the same solid background when the sheet is
              rubber-banded upwards, so no see-through gap appears underneath. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-full h-[60vh] bg-inherit"
          />
        </Vaul.Content>
      </Vaul.Portal>
    );
  },
);
GlassSheetContent.displayName = "GlassSheetContent";

export const GlassSheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-1 pt-1 pb-3 text-start", className)} {...props} />
);

export const GlassSheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <Vaul.Title
    ref={ref}
    className={cn("text-base font-semibold text-foreground tracking-tight", className)}
    {...props}
  />
));
GlassSheetTitle.displayName = "GlassSheetTitle";

export const GlassSheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <Vaul.Description
    ref={ref}
    className={cn("text-xs text-muted-foreground mt-0.5", className)}
    {...props}
  />
));
GlassSheetDescription.displayName = "GlassSheetDescription";
