import { memo } from "react";
import { FileUp, Link2, X, Video as VideoIcon } from "lucide-react";
import type { AttachedFile } from "../hooks/useAttachments";

interface Props {
  files: AttachedFile[];
  onRemove: (index: number) => void;
}

/**
 * Horizontal chip strip of files/images attached to the composer.
 * Renders nothing when there are no attachments. Memoized so it does
 * not re-render on every keystroke in the parent composer.
 */
function ComposerAttachments({ files, onRemove }: Props) {
  if (files.length === 0) return null;
  return (
    <div className="flex gap-2 px-2 overflow-x-auto pb-1 mb-1">
      {files.map((f, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg liquid-glass-button text-xs text-foreground shrink-0"
        >
          {f.type === "image" ? (
            <img loading="lazy" decoding="async" src={f.data} alt="" className="w-8 h-8 rounded object-cover" />
          ) : f.type === "video" ? (
            <VideoIcon className="w-3 h-3" />
          ) : f.type === "link" ? (
            <Link2 className="w-3 h-3" />
          ) : (
            <FileUp className="w-3 h-3" />
          )}
          <span className="truncate max-w-[100px]">{f.name}</span>
          <button
            onClick={() => onRemove(i)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${f.name}`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default memo(ComposerAttachments);
