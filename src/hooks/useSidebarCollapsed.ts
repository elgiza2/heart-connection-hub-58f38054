import { useEffect, useState, useCallback, useRef } from "react";

const EVT = "megsy:sidebar-collapsed-changed";

// Module-level state so all instances stay in sync within a session.
// Always starts collapsed on every entry/refresh (not persisted across sessions).
let currentCollapsed = true;

export function useSidebarCollapsed(): [boolean, (v: boolean) => void, () => void] {
  const [collapsed, setCollapsedState] = useState<boolean>(currentCollapsed);
  const ref = useRef(collapsed);
  ref.current = collapsed;

  useEffect(() => {
    const onChange = () => setCollapsedState(currentCollapsed);
    window.addEventListener(EVT, onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
    };
  }, []);

  const setCollapsed = useCallback((v: boolean) => {
    currentCollapsed = v;
    setCollapsedState(v);
    window.dispatchEvent(new Event(EVT));
  }, []);

  const toggle = useCallback(() => {
    const next = !currentCollapsed;
    currentCollapsed = next;
    setCollapsedState(next);
    window.dispatchEvent(new Event(EVT));
  }, []);

  return [collapsed, setCollapsed, toggle];
}
