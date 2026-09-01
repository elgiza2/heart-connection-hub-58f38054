import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";

/**
 * Shared hub shell: keeps one page mounted per section (auth / billing /
 * integrations) and cross-fades the inner view whenever the child route
 * changes, so the section feels like a single page with swapping panels.
 */
export const AnimatedShell = ({ className }: { className?: string }) => {
  const location = useLocation();

  return (
    <div className={className ?? "min-h-dvh bg-background text-foreground"}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default AnimatedShell;
