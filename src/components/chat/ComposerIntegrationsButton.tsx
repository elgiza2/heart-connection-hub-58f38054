import { Blocks } from "lucide-react";
import { useConnectedApps } from "@/hooks/useConnectedApps";

interface Props {
  onClick: () => void;
  label?: string;
}

/**
 * Composer integrations control.
 * - No connected apps → generic integrations glyph.
 * - One app → that app's real logo.
 * - Many apps → a clean overlapped stack of up to 3 logos (+N).
 * Fully transparent: no background, no border.
 */
export function ComposerIntegrationsButton({ onClick, label = "Integrations" }: Props) {
  const apps = useConnectedApps();
  const shown = apps.slice(0, 3);
  const extra = apps.length - shown.length;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 inline-flex h-11 w-11 md:h-10 md:w-10 items-center justify-center rounded-full border-0 bg-transparent outline-none transition-opacity hover:opacity-80 active:scale-95"
      style={{ background: "transparent", border: 0, boxShadow: "none" }}
    >
      {shown.length === 0 ? (
        <Blocks className="w-[20px] h-[20px] text-foreground/70" strokeWidth={1.9} />
      ) : (
        <span className="flex items-center">
          {shown.map((a, i) => (
            <span
              key={a.app}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full overflow-hidden bg-foreground/10 ring-1 ring-background"
              style={{ marginInlineStart: i === 0 ? 0 : -8, zIndex: 10 - i }}
            >
              {a.domain ? (
                <img
                  src={`https://logo.clearbit.com/${a.domain}`}
                  alt={a.name}
                  width={24}
                  height={24}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-semibold text-foreground/80">
                  {a.name.slice(0, 1)}
                </span>
              )}
            </span>
          ))}
          {extra > 0 && (
            <span className="ms-1 text-[11px] font-semibold text-foreground/60">+{extra}</span>
          )}
        </span>
      )}
    </button>
  );
}

export default ComposerIntegrationsButton;
