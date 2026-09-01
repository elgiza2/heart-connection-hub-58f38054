import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Distance in px from viewport at which to mount (default 400). */
  rootMargin?: string;
  /** Height reserved before the content mounts, to avoid CLS. */
  minHeight?: number | string;
  /** Optional placeholder rendered until visible. */
  fallback?: ReactNode;
  /** Force-render immediately (e.g. for SSR / print / no IO support). */
  eager?: boolean;
  className?: string;
}

/**
 * Mounts its children only when the placeholder scrolls near the viewport.
 * Perfect for below-the-fold sections: hero videos, galleries, testimonials,
 * FAQs, footers, charts. Cuts initial JS/DOM cost dramatically.
 */
export function LazyOnVisible({
  children,
  rootMargin = "400px",
  minHeight,
  fallback = null,
  eager = false,
  className,
}: Props) {
  const [visible, setVisible] = useState(eager);
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;
  return (
    <div
      ref={holderRef}
      className={className}
      style={minHeight ? { minHeight } : undefined}
      aria-hidden="true"
    >
      {fallback}
    </div>
  );
}
