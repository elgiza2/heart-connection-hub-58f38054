import { m as motion } from "framer-motion";

/**
 * Clean listening animation shown inside the composer while dictation runs.
 */
export function ComposerVoiceWave({ label = "Listening…" }: { label?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex items-center gap-3 px-1 py-2 min-h-[38px]"
    >
      <span className="flex items-end gap-[3px] h-5">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-primary"
            animate={{ height: ["25%", "100%", "40%"] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.08,
            }}
            style={{ height: "40%" }}
          />
        ))}
      </span>
      <span className="text-[13px] text-foreground/60">{label}</span>
    </motion.div>
  );
}

export default ComposerVoiceWave;
