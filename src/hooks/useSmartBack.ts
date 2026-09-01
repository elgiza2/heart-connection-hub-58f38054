/**
 * @doc useSmartBack — returns a `goBack` function that goes back in history
 * only when the user actually navigated *within* the app to reach the current
 * page. Otherwise it falls back to the given path.
 *
 * Tracks internal navigation depth per session so `window.history.length`
 * (which counts entries across the whole browsing session, including other
 * sites) can't fool us into leaving the app.
 */
import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const KEY = "megsy:nav-depth";

function getDepth(): number {
  try {
    return Number(sessionStorage.getItem(KEY) || "0") | 0;
  } catch {
    return 0;
  }
}

function setDepth(v: number) {
  try {
    sessionStorage.setItem(KEY, String(Math.max(0, v)));
  } catch {
    /* ignore */
  }
}

/** Increment nav depth on every in-app location change. Call once in App. */
export function useTrackInAppNavigation() {
  const location = useLocation();
  useEffect(() => {
    setDepth(getDepth() + 1);
  }, [location.key]);
}

export function useSmartBack(fallback: string = "/") {
  const navigate = useNavigate();
  return useCallback(() => {
    if (getDepth() > 1) {
      setDepth(getDepth() - 1);
      navigate(-1);
    } else {
      navigate(fallback);
    }
  }, [navigate, fallback]);
}

export default useSmartBack;