import { useEffect, useRef, useState, useId } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Mermaid diagram renderer. Loads mermaid lazily and renders SVG.
 * Used from Markdown code blocks with ```mermaid.
 */
interface Props {
  code: string;
}

export default function MermaidBlock({ code }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rawId = useId();
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          fontFamily: "inherit",
        });
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && mounted.current) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && mounted.current) {
          setError(e instanceof Error ? e.message : "Failed to render diagram");
        }
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [code, id]);

  if (error) {
    return (
      <div
        className="my-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-300"
        dir="ltr"
      >
        <div className="flex items-center gap-1.5 mb-1 font-medium">
          <AlertTriangle className="w-3.5 h-3.5" /> Mermaid error
        </div>
        <pre className="font-mono whitespace-pre-wrap opacity-80">{error}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        className="my-4 rounded-2xl p-4 text-xs text-muted-foreground animate-pulse"
        style={{ backgroundColor: "var(--code-bg)" }}
        dir="ltr"
      >
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="my-4 rounded-2xl overflow-auto p-4 flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
      style={{
        backgroundColor: "var(--code-bg)",
        boxShadow: "inset 0 0 0 1px hsl(var(--foreground) / 0.10)",
      }}
      dir="ltr"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
