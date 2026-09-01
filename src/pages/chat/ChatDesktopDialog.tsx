import React from "react";
import { createPortal } from "react-dom";

/**
 * Glassy themed modal used for compact dialogs inside ChatPage on desktop.
 * Renders into document.body via a portal so it always sits above sticky
 * chrome and avoids ancestor `overflow:hidden` clipping.
 */
export const ChatDesktopDialog = ({
  open,
  onOpenChange,
  children,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) => {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="theme-fixed fixed inset-0 z-[1000] animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
        style={{
          backgroundColor: "hsl(var(--foreground) / 0.06)",
          backdropFilter: "blur(3px) saturate(120%)",
          WebkitBackdropFilter: "blur(3px) saturate(120%)",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed left-1/2 top-1/2 z-[1001] w-[calc(100vw-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 p-[1px] rounded-ios-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 ${className}`}
        onClick={(event) => event.stopPropagation()}
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--foreground) / 0.14), transparent 50%, hsl(var(--foreground) / 0.04))",
        }}
      >
        <div
          className="relative rounded-[31px] border border-foreground/8 text-foreground shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]"
          style={{
            background:
              "linear-gradient(180deg, hsl(var(--background) / 0.16), hsl(var(--background) / 0.08))",
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
          }}
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
};
