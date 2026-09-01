import * as React from "react";
import { cn } from "@/lib/utils";

export const Message = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex gap-3 w-full", className)} {...props} />
  ),
);
Message.displayName = "Message";

interface MessageAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: React.ReactNode;
}

export const MessageAvatar = React.forwardRef<HTMLDivElement, MessageAvatarProps>(
  ({ className, src, alt, fallback, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full bg-foreground/5 border border-border/40 flex items-center justify-center overflow-hidden",
        className,
      )}
      {...props}
    >
      {src ? <img loading="lazy" decoding="async" src={src} alt={alt} className="w-full h-full object-cover" /> : fallback}
    </div>
  ),
);
MessageAvatar.displayName = "MessageAvatar";

export const MessageContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex-1 min-w-0 space-y-2 text-[15px] leading-relaxed text-foreground",
      className,
    )}
    {...props}
  />
));
MessageContent.displayName = "MessageContent";
