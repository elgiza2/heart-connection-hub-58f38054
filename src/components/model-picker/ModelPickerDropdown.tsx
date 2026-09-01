import { m as motion } from "framer-motion";
import type { AgentModel } from "@/lib/agentRegistry";
import { glassModelMenu, glassModelMenuStyle } from "./glassModelMenuStyles";

interface ModelPickerDropdownProps {
  models: AgentModel[];
  query: string;
  onSelect: (model: AgentModel) => void;
  onClose: () => void;
}

const ModelPickerDropdown = ({ models, query, onSelect, onClose }: ModelPickerDropdownProps) => {
  const filtered = query
    ? models.filter(
        (m) =>
          m.label.toLowerCase().includes(query.toLowerCase()) ||
          m.id.toLowerCase().includes(query.toLowerCase()),
      )
    : models;

  if (filtered.length === 0) return null;

  return (
    <>
      <div className="fixed inset-0 z-[44]" onClick={onClose} />
      <motion.div
        data-tier-menu
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className={`${glassModelMenu.panelScrollable} absolute bottom-full mb-2 left-0 z-[46] w-[min(20rem,calc(100vw-1rem))] max-h-[min(320px,58dvh)] unified-menu-surface`}
        style={glassModelMenuStyle}
      >
        <p className={`${glassModelMenu.sectionLabel} px-3 py-1.5`}>
          Models
        </p>
        {filtered.map((model) => (
          <button
            key={model.id}
            onClick={() => onSelect(model)}
            className={glassModelMenu.item(false, "justify-between mb-1 last:mb-0 active:scale-[0.98]")}
          >
            <span className="text-sm font-black text-foreground">{model.label}</span>
            <span className="text-[11px] font-black text-brand-ink bg-brand-mint border border-brand-ink px-2 py-0.5 rounded-full">
              {model.cost} MC
            </span>
          </button>
        ))}
      </motion.div>
    </>
  );
};

export default ModelPickerDropdown;
