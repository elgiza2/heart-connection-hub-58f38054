import { useLocation, type Location } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isCacheablePath, scheduleSnapshotSave } from "@/lib/pageSnapshot";

/**
 * PageTransition — wraps route content and replays a soft fade+lift animation
 * whenever the URL pathname changes. CSS-driven (see page-transitions.css) so
 * no framer-motion dependency is added to the initial critical path.
 *
 * `location` may be passed by the caller (App renders routes with a deferred
 * location) so the animation fires when the new page is actually painted,
 * not when the URL changes.
 *
 * Chat is excluded because it owns its own message-level animation choreography
 * and a container-level cross-fade would fight it.
 */
const PageTransition = ({
  children,
  location: locationProp,
}: {
  children: ReactNode;
  location?: Location;
}) => {
  const routerLocation = useLocation();
  const location = locationProp ?? routerLocation;
  const transitionKey = useMemo(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments[0] === "chat") return "chat";
    if (segments[0] === "settings") return "settings";
    return segments[0] || "home";
  }, [location.pathname]);

  const [key, setKey] = useState(transitionKey);
  const lastKeyRef = useRef(transitionKey);

  useEffect(() => {
    if (lastKeyRef.current !== transitionKey) {
      lastKeyRef.current = transitionKey;
      setKey(transitionKey);
    }
  }, [transitionKey]);

  useEffect(() => {
    const path = location.pathname;
    if (!isCacheablePath(path)) return;
    const capture = () => {
      try {
        const root = document.getElementById("root");
        if (!root || root.getAttribute("data-snapshot-preview") === "true") return;
        const html = root.innerHTML;
        if (html) scheduleSnapshotSave(path, html);
      } catch {}
    };
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    if (typeof ric === "function") {
      const id = ric(capture, { timeout: 1800 });
      return () => {
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
      };
    }
    const id = window.setTimeout(capture, 900);
    return () => window.clearTimeout(id);
  }, [location.pathname]);

  const isChat = location.pathname.startsWith("/chat") || location.pathname === "/index";

  return (
    <div key={key} className={isChat ? "ng-page-enter ng-page-enter--chat" : "ng-page-enter"}>
      {children}
    </div>
  );
};

export default PageTransition;
