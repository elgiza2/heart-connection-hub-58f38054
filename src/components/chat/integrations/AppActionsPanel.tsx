/** @doc Actions of one connected app, shown inside the connector detail view
 *  using the shared clean tools list. Tapping an action drops a ready prompt
 *  into the composer.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listAppTools, type AppTool } from "@/lib/pipedream/client";
import ToolsList from "./ToolsList";

export default function AppActionsPanel({
  slug,
  appName,
  onUse,
}: {
  slug: string;
  appName: string;
  onUse?: () => void;
}) {
  const [tools, setTools] = useState<AppTool[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listAppTools(slug)
      .then((res) => {
        if (alive) setTools(res.tools ?? []);
      })
      .catch((e: any) => {
        if (alive) setTools([]);
        toast.error(e?.message || "Couldn't load actions");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-foreground/65">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!tools || tools.length === 0) return null;

  return (
    <ToolsList
      title="Tools"
      tools={tools.map((t) => ({ key: t.key, name: t.name, description: t.description }))}
      onPick={(tool) => {
        window.dispatchEvent(
          new CustomEvent("megsy:composer-insert", {
            detail: { text: `Use ${appName} → ${tool.name}: ` },
          }),
        );
        onUse?.();
      }}
    />
  );
}
