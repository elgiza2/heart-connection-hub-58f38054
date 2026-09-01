import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Buckets that are actually public on the Supabase project. Anything else that
 * was stored with an `/object/public/<bucket>/` URL (e.g. `media-studio`, which
 * holds generated videos) must be re-signed before a <video>/<img> can load it,
 * otherwise the browser receives a 400 JSON body and shows an empty player.
 */
const PUBLIC_BUCKETS = new Set([
  "avatars",
  "model-media",
  "slide-presentations",
  "spreadsheets",
  "user-images",
  "published-sites",
  "build-assets",
  "workspace-assets",
  "showcase-media",
  "presentations",
  "code-publishes",
]);

const SIGNED_TTL_SECONDS = 60 * 60 * 6;
const cache = new Map<string, string>();

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const m = /\/storage\/v1\/object\/(?:public|authenticated)\/([^/]+)\/(.+)$/.exec(url);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2].split("?")[0]) };
}

/** Returns a URL the browser can actually fetch (signs private-bucket URLs). */
export async function resolveMediaUrl(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  if (url.includes("/object/sign/") || url.includes("token=")) return url;
  const parsed = parseStorageUrl(url);
  if (!parsed || PUBLIC_BUCKETS.has(parsed.bucket)) return url;
  const cached = cache.get(url);
  if (cached) return cached;
  try {
    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, SIGNED_TTL_SECONDS);
    if (error || !data?.signedUrl) return url;
    cache.set(url, data.signedUrl);
    return data.signedUrl;
  } catch {
    return url;
  }
}

/** React helper: resolves a (possibly private) storage URL for playback. */
export function useResolvedMediaUrl(url?: string | null): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(url ?? undefined);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setResolved(undefined);
      return;
    }
    setResolved(cache.get(url) ?? url);
    resolveMediaUrl(url).then((next) => {
      if (!cancelled) setResolved(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}
