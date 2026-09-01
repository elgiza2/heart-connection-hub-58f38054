import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";
import ComposerModelMenu from "./ComposerModelMenu";
import {
  MediaSettingsPanel,
  type MediaMode,
  type MediaSettings,
} from "@/components/chat/mobile/MediaSettingsMenu";

interface Props {
  mediaMode: MediaMode;
  modelMenuProps: React.ComponentProps<typeof ComposerModelMenu>;
  onSettingsChange?: (s: MediaSettings) => void;
}

export default function ModelSettingsBar({ mediaMode, modelMenuProps, onSettingsChange }: Props) {
  const [open, setOpen] = useState(false);

  const wrappedModelMenuProps = {
    ...modelMenuProps,
    onOpenChange: (next: boolean) => {
      if (next) setOpen(false);
      modelMenuProps.onOpenChange?.(next);
    },
  };

  return (
    <div className="w-full flex flex-col items-stretch">
      <div className="flex w-full items-center gap-3">
        <div className="flex-1 min-w-0 flex items-center">
          <ComposerModelMenu
            {...wrappedModelMenuProps}
            variant="segment"
            side={wrappedModelMenuProps.side ?? "top"}
            align={wrappedModelMenuProps.align ?? "start"}
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Generation settings"
          className="shrink-0 inline-flex h-11 items-center gap-2 px-4 text-[12.5px] font-black text-brand-parchment rounded-[18px] bg-surface-1 border-[2.5px] border-brand-ink active:translate-x-[2px] active:translate-y-[2px] transition-all duration-200 shadow-[3px_3px_0_rgba(201,168,255,0.24)]"
        >
          <Settings2
            className={`h-4 w-4 text-brand-action transition-transform duration-300 ${open ? "rotate-90" : ""}`}
          />
          <span className="tracking-tight">Settings</span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-brand-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="settings-inline"
            initial={{ height: 0, opacity: 0, y: -4 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden w-full flex justify-center"
          >
            <div className="mt-4 w-full max-w-[min(420px,calc(100vw-32px))] rounded-[26px] border-[2.5px] border-brand-ink bg-surface-1 p-5 shadow-[4px_4px_0_rgba(59,130,246,0.20)]">
              <MediaSettingsPanel mode={mediaMode} onChange={onSettingsChange} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
