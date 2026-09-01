/** @doc Square logo for a ready-made API app, with a letter fallback. */
import { useState } from "react";
import type { ApiApp } from "@/lib/apiApps/types";

/** The service's own domain, used to look its brand mark up. */
function domain(app: ApiApp): string | null {
  const source =
    [app.baseUrl, app.docsUrl, app.keyUrl].find((url) => url && !url.includes("${")) || "";
  try {
    return new URL(source).hostname.replace(/^(api|api-m|www|app|console|dashboard|graph|open)\./, "");
  } catch {
    return null;
  }
}

/** Ordered logo sources. Simple Icons is only used for slugs we know exist
 *  (or when the app has no domain), because every miss is a 404 + flicker;
 *  otherwise the service's own favicon is tried first. */
function sourcesFor(app: ApiApp): string[] {
  const host = domain(app);
  const simpleIconAliases: Record<string, string> = {
    "x (twitter)": "x",
    "google drive": "googledrive",
    "google calendar": "googlecalendar",
    "google sheets": "googlesheets",
    "google docs": "googledocs",
    "microsoft teams": "microsoftteams",
    "microsoft excel": "microsoftexcel",
    "google contacts": "googlecontacts",
    "google slides": "googleslides",
    facebook: "facebook",
  };
  const knownSlug = simpleIconAliases[app.name.trim().toLowerCase()] ?? null;
  const guessedSlug = app.name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]/g, "");
  const simpleIcon = (slug: string | null) =>
    slug ? `https://cdn.simpleicons.org/${slug}` : null;

  const ordered = host
    ? [
        simpleIcon(knownSlug),
        `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
        `https://unavatar.io/${host}?fallback=false`,
        `https://icons.duckduckgo.com/ip3/${host}.ico`,
        simpleIcon(knownSlug ? null : guessedSlug),
        app.logo,
      ]
    : [simpleIcon(knownSlug ?? guessedSlug), app.logo];

  return ordered.filter(Boolean) as string[];
}



export default function ApiAppLogo({ app, size = 38 }: { app: ApiApp; size?: number }) {
  const [step, setStep] = useState(0);
  const sources = sourcesFor(app);
  const src = sources[step];
  const failed = !src;
  const radius = Math.round(size * 0.28);

  if (failed || !sources.length) {
    return (
      <span
        className="flex shrink-0 items-center justify-center bg-foreground/[0.06] font-semibold text-foreground/60 ring-1 ring-inset ring-foreground/[0.08]"
        style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.4 }}
      >
        {app.name.charAt(0).toUpperCase()}
      </span>
    );
  }


  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: radius, background: "transparent" }}
    >
      <img
        src={src}
        alt={app.name}
        loading="lazy"
        onError={() => setStep((current) => current + 1)}
        style={{ width: size * 0.68, height: size * 0.68, objectFit: "contain", backgroundColor: "transparent" }}
      />
    </span>
  );
}
