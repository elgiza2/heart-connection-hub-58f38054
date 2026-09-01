import { m as motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, FileText, Globe, Layers, Timer, Users, X } from "lucide-react";
import MegsyOsIntroBody from "./MegsyOsIntroBody";

export interface MegsyOsIntroProps {
  open: boolean;
  onClose: () => void;
  isProPlusPlan: () => boolean;
  navigate: (path: string) => void;
  handleModeChange: (mode: any) => void;
}

export function MegsyOsIntro({
  open,
  onClose,
  isProPlusPlan,
  navigate,
  handleModeChange,
}: MegsyOsIntroProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-modal bg-background/70 backdrop-blur-sm"
          />
          <MegsyOsIntroBody
            onClose={onClose}
            isProPlusPlan={isProPlusPlan}
            navigate={navigate}
            handleModeChange={handleModeChange}
            icons={{ ChevronLeft, FileText, Globe, Layers, Timer, Users, X }}
          />
        </>
      )}
    </AnimatePresence>
  );
}

export default MegsyOsIntro;
