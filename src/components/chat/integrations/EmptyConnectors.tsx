import { Plug } from "lucide-react";

export default function EmptyConnectors({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Plug className="h-8 w-8 text-foreground/65" />
      <p className="text-[13.5px] text-foreground/65">{label}</p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-[12px] bg-foreground/[0.08] px-4 py-2 text-[13px] text-foreground/80"
          style={{ border: 0 }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
