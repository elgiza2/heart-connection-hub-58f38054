import type { NavigateFunction } from "react-router-dom";

export const goBackOr = (navigate: NavigateFunction, fallback: string) => {
  if (typeof window === "undefined") {
    navigate(fallback, { replace: true });
    return;
  }

  const state = window.history.state as { idx?: number } | null;
  const hasRouterHistory = typeof state?.idx === "number" && state.idx > 0;
  let sameOriginReferrer = false;

  try {
    sameOriginReferrer =
      !!document.referrer && new URL(document.referrer).origin === window.location.origin;
  } catch {
    sameOriginReferrer = false;
  }

  if (hasRouterHistory || sameOriginReferrer) navigate(-1);
  else navigate(fallback, { replace: true });
};
