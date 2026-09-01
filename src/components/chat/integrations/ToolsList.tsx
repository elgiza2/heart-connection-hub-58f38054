/** @doc Clean, searchable list of tools/actions. Shared by API apps and
 *  connected accounts so both render the same way.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export type ToolItem = { key: string; name: string; description?: string };

export default function ToolsList({
  title = "Tools",
  tools,
  onPick,
}: {
  title?: string;
  tools: ToolItem[];
  onPick: (tool: ToolItem) => void;
}) {
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(s) || (t.description || "").toLowerCase().includes(s),
    );
  }, [q, tools]);

  if (tools.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-2 pb-1">
        <p className="text-[12.5px] text-foreground/65">{title}</p>
        <span className="text-[12.5px] text-foreground/65">{tools.length}</span>
      </div>

      {tools.length > 8 && (
        <div className="flex h-10 items-center gap-2 px-2">
          <Search className="h-4 w-4 shrink-0 text-foreground/65" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tools"
            className="h-full w-full text-[13.5px] text-foreground outline-none placeholder:text-foreground/65"
            style={{
              border: 0,
              background: "transparent",
              boxShadow: "none",
              borderRadius: 0,
              padding: 0,
            }}
          />
        </div>
      )}

      <div>
        {visible.map((tool) => (
          <button
            key={tool.key}
            type="button"
            onClick={() => onPick(tool)}
            className="block w-full px-2 py-2.5 text-start active:opacity-60"
            style={{ border: 0, background: "transparent" }}
          >
            <span className="block truncate text-[13.5px] text-foreground/85">{tool.name}</span>
            {tool.description && (
              <span className="mt-0.5 block truncate text-[11.5px] text-foreground/65">
                {tool.description}
              </span>
            )}
          </button>
        ))}
        {visible.length === 0 && (
          <p className="py-6 text-center text-[12.5px] text-foreground/65">No matching tools</p>
        )}
      </div>
    </div>
  );
}
