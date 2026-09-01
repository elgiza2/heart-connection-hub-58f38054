import { m as motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";
import { toast } from "sonner";

interface ImagePreviewModalProps {
  url: string | null;
  alt?: string;
  onClose: () => void;
}

const ImagePreviewModal = ({ url, alt, onClose }: ImagePreviewModalProps) => {
  const handleDownload = async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "png").split(";")[0];
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${(alt || "image").slice(0, 30).replace(/\s+/g, "_") || "image"}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
    } catch (e) {
      toast.error("Download failed, opening in a new tab");
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1200] bg-background/80 backdrop-blur-xl flex items-center justify-center p-3"
          onClick={onClose}
        >
          {/* Close button — floating top-right of screen */}
          <button
            onClick={onClose}
            className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 z-10 w-10 h-10 rounded-full bg-foreground/10 backdrop-blur-2xl border border-foreground/20 text-foreground flex items-center justify-center hover:bg-foreground/20 transition shadow-lg"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-4xl max-h-[92vh] flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full flex-1 min-h-0 flex items-center justify-center">
              <img loading="lazy" decoding="async"
                src={url}
                alt={alt || "Preview"}
                className="max-w-full max-h-[78vh] rounded-2xl object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
              />
            </div>

            {/* Bottom action bar — clean glass */}
            <div
              className="flex items-center gap-2 px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
              style={{
                background: "hsl(var(--foreground) / 0.09)",
                backdropFilter: "blur(22px) saturate(180%) brightness(1.06)",
                WebkitBackdropFilter: "blur(22px) saturate(180%) brightness(1.06)",
                borderRadius: "9999px",
                border: "1px solid hsl(var(--foreground) / 0.1)",
                boxShadow:
                  "inset 0 1px 1px 0 hsl(var(--foreground) / 0.25), inset 0 -1px 1px 0 hsl(var(--foreground) / 0.08), 0 14px 36px hsl(0 0% 0% / 0.3)",
              }}
            >
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition active:scale-[0.98]"
              >
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ImagePreviewModal;
