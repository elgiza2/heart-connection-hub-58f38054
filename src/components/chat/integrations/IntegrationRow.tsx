import { useMemo, useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import type { Integration } from "@/lib/integrationsData";

/** Ordered logo sources. The service's own domain is tried first because it
 *  always resolves; Simple Icons only has a subset of brands and every miss
 *  costs a visible 404 + logo flicker. */
function logoSources(item: Integration): string[] {
  const out: string[] = [];
  const slug = (item.pipedreamSlug || item.app || item.id)
    .toLowerCase()
    .replace(/[_\s]+/g, "")
    .replace(/[^a-z0-9-]/g, "");
  if (item.domain) {
    out.push(`https://www.google.com/s2/favicons?domain=${item.domain}&sz=128`);
    out.push(`https://unavatar.io/${item.domain}?fallback=false`);
  }
  if (slug) out.push(`https://cdn.simpleicons.org/${slug}`);
  return out;
}


export function IntegrationLogo({ item, size = 40 }: { item: Integration; size?: number }) {
  const sources = useMemo(() => logoSources(item), [item]);
  const [idx, setIdx] = useState(0);
  const src = sources[idx];

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden"
      style={{ width: size, height: size, background: "transparent" }}
    >
      {src ? (
        <img
          src={src}
          alt={item.name}
          loading="lazy"
          className="object-contain"
          style={{ width: size * 0.68, height: size * 0.68, background: "transparent" }}
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <span className="text-[13px] font-semibold text-foreground/70">{item.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

interface RowProps {
  item: Integration;
  connected: boolean;
  busy: boolean;
  onOpen: () => void;
}

/** Flat connector row — no card, sits directly on the sheet surface. */
export default function IntegrationRow({ item, connected, busy, onOpen }: RowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-integration-row
      className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2.5 text-start transition-colors active:bg-foreground/[0.05]"
      style={{ border: 0, background: "transparent", minHeight: 58 }}
      aria-label={item.name}
    >
      <IntegrationLogo item={item} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium text-foreground">{item.name}</span>
        <span className="mt-0.5 block truncate text-[11.5px] leading-[1.5] text-foreground/65">
          {item.description}
        </span>
      </span>
      <span className="shrink-0 text-foreground/65">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : connected ? (
          <Check style={{ width: 18, height: 18 }} className="text-primary" />
        ) : (
          <ChevronRight className="h-[18px] w-[18px]" />
        )}
      </span>
    </button>
  );
}

