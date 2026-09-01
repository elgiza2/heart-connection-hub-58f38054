import { AnimatePresence, m as motion } from "framer-motion";

interface RemoteAiBusyBannerProps {
  remoteAiBusy: { name: string } | null;
}

export const RemoteAiBusyBanner = ({ remoteAiBusy }: RemoteAiBusyBannerProps) => {
  return (
    <AnimatePresence>
      {remoteAiBusy && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className="relative mx-auto overflow-hidden px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/20 to-amber-500/10 border border-amber-500/30 text-amber-600 text-xs flex items-center justify-center gap-2"
        >
          <span className="flex gap-0.5">
            <span
              className="w-1 h-1 rounded-full bg-amber-500 animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-1 h-1 rounded-full bg-amber-500 animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="w-1 h-1 rounded-full bg-amber-500 animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </span>
          <span className="font-medium">Megsy is replying to {remoteAiBusy.name}…</span>
          <motion.span
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-amber-400/20 to-transparent"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RemoteAiBusyBanner;
