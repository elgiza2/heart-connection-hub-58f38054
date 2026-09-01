import { forwardRef, useCallback, useRef } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { prefetchRoute } from "@/lib/routePrefetch";

/**
 * Drop-in replacement for react-router-dom's <Link>. Prefetches the target
 * route's JS chunks on hover / focus / touchstart — the same intent signals
 * Facebook uses. Zero behavior change on click.
 *
 * Usage: replace `import { Link } from "react-router-dom"` with
 *        `import { PrefetchLink as Link } from "@/components/common/PrefetchLink"`.
 */
export const PrefetchLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function PrefetchLink({ to, onMouseEnter, onFocus, onTouchStart, ...rest }, ref) {
    const firedRef = useRef(false);

    const trigger = useCallback(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      const path = typeof to === "string" ? to : (to as { pathname?: string }).pathname ?? "";
      if (path) prefetchRoute(path);
    }, [to]);

    return (
      <Link
        ref={ref}
        to={to}
        {...rest}
        onMouseEnter={(e) => {
          trigger();
          onMouseEnter?.(e);
        }}
        onFocus={(e) => {
          trigger();
          onFocus?.(e);
        }}
        onTouchStart={(e) => {
          trigger();
          onTouchStart?.(e);
        }}
      />
    );
  },
);
