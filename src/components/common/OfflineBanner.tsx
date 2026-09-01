import { m as motion, AnimatePresence } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const OfflineBanner = () => {
  const isOnline = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-toast bg-destructive text-destructive-foreground px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] flex items-center justify-center gap-2 text-sm font-medium"
        >
          <WifiOff className="w-4 h-4" />
          You're offline — check your internet connection
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineBanner;
