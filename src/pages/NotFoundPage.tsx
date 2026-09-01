/**
 * @doc Real 404 page. Unknown URLs previously rendered Chat with HTTP 200,
 * which is a soft 404: crawlers index junk URLs and users get no signal that
 * the address was wrong. This page is noindexed and, on hosts that support it,
 * reports a 404 status through the prerender/status hint below.
 */
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import SEOHead from "@/components/common/SEOHead";

const NotFoundPage = () => {
  const location = useLocation();

  useEffect(() => {
    // Static hosts serve the SPA shell with 200; this hint lets prerender and
    // status-aware crawlers/hosts record the response as a 404.
    const meta = document.createElement("meta");
    meta.name = "prerender-status-code";
    meta.content = "404";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  return (
    <>
      <SEOHead
        title="Page not found"
        description="This Megsy AI page does not exist. Head back to chat, pricing or your settings."
        path={location.pathname}
        noindex
      />
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-md text-center">
          <p className="text-sm font-medium tracking-[0.2em] text-muted-foreground">404</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            This page doesn’t exist
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The address <span className="font-mono text-foreground">{location.pathname}</span> isn’t
            part of Megsy. It may have been moved or the link may be mistyped.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/chat"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Go to Megsy
            </Link>
            <Link
              to="/pricing"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              See pricing
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <Link className="hover:text-foreground" to="/settings">Settings</Link>
            <Link className="hover:text-foreground" to="/contact">Contact</Link>
            <Link className="hover:text-foreground" to="/terms">Terms</Link>
            <Link className="hover:text-foreground" to="/privacy">Privacy</Link>
          </div>
        </div>
      </main>
    </>
  );
};

export default NotFoundPage;
