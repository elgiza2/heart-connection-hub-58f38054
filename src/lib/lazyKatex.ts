// KaTeX (rehype-katex + katex.min.css ≈ 300 KB) is only needed when a message
// actually contains math. Loading it statically inside ChatMessage put it on
// the critical chat boot path, so it is fetched on demand instead.
import { useEffect, useState } from "react";
import type { Pluggable } from "unified";

const MATH_RE = /(\$\$[\s\S]+?\$\$)|(\$[^$\n]+\$)|(\\\((?:[\s\S]+?)\\\))|(\\\[[\s\S]+?\\\])|\\(?:frac|sqrt|sum|int|alpha|beta|theta|pi|cdot|times|le|ge|neq)\b/;

export const hasMath = (text: string) => MATH_RE.test(text ?? "");

let cached: Pluggable | null = null;
let pending: Promise<Pluggable> | null = null;

const loadKatex = () => {
  if (cached) return Promise.resolve(cached);
  pending ??= Promise.all([import("rehype-katex"), import("katex/dist/katex.min.css")]).then(
    ([mod]) => {
      cached = mod.default as unknown as Pluggable;
      return cached;
    },
  );
  return pending;
};

/**
 * Returns the rehype-katex plugin once loaded, or null while it is not needed.
 * Passing `false` skips the fetch entirely.
 */
export function useKatexPlugin(enabled: boolean): Pluggable | null {
  const [plugin, setPlugin] = useState<Pluggable | null>(cached);

  useEffect(() => {
    if (!enabled || plugin) return;
    let alive = true;
    void loadKatex().then((p) => {
      if (alive) setPlugin(p);
    });
    return () => {
      alive = false;
    };
  }, [enabled, plugin]);

  return enabled ? plugin : null;
}
