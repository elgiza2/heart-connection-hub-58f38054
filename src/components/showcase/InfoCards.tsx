import { useState, useEffect } from "react";
import { m as motion } from "framer-motion";
import { ExternalLink, ImageOff } from "lucide-react";

interface InfoItem {
  title: string;
  description: string;
  action?: string;
  image?: string;
  link?: string;
}

interface InfoCardsProps {
  items: InfoItem[];
  onAction?: (action: string, title: string) => void;
}

const CARD_COLORS = [
  "flow-card-blue",
  "flow-card-purple",
  "flow-card-teal",
  "flow-card-amber",
  "flow-card-green",
];

const TypewriterText = ({ text, delay = 0 }: { text: string; delay?: number }) => {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 18);
    return () => clearInterval(interval);
  }, [started, text]);

  return <>{started ? displayed : ""}</>;
};

const CardImage = ({ src, alt }: { src: string; alt: string }) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const proxiedSrc = src.startsWith("http")
    ? `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=400&h=200&fit=cover&output=webp`
    : src;
  const [fallbackDirect, setFallbackDirect] = useState(false);

  if (error) {
    return (
      <div className="w-full h-28 bg-foreground/5 flex items-center justify-center">
        <ImageOff className="w-6 h-6 text-foreground/65" />
      </div>
    );
  }

  return (
    <div className="w-full h-28 overflow-hidden relative">
      {loading && <div className="absolute inset-0 bg-foreground/5 animate-pulse" />}
      <img loading="lazy" decoding="async"
        src={fallbackDirect ? src : proxiedSrc}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity ${loading ? "opacity-0" : "opacity-100"}`}
        onError={() => {
          if (!fallbackDirect) setFallbackDirect(true);
          else setError(true);
        }}
        onLoad={() => setLoading(false)}
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

const InfoCards = ({ items, onAction }: InfoCardsProps) => {
  const handleCardClick = (item: InfoItem) => {
    if (item.link) {
      window.open(item.link, "_blank", "noopener,noreferrer");
      return;
    }
    if (item.action && onAction) {
      if (item.action === "Connect") {
        onAction(item.action, item.title);
        return;
      }
      onAction(item.action, item.title);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {items.map((item, i) => {
        const colorClass = CARD_COLORS[i % CARD_COLORS.length];
        const isClickable = !!(item.action && onAction) || !!item.link;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            onClick={() => isClickable && handleCardClick(item)}
            className={`rounded-xl overflow-hidden ${colorClass} ${isClickable ? "cursor-pointer active:scale-[0.98]" : ""} transition-transform`}
          >
            {item.image && <CardImage src={item.image} alt={item.title} />}
            <div className="p-3.5 relative">
              <div className="flow-points-wrapper">
                {Array.from({ length: 8 }).map((_, j) => (
                  <span key={j} className="flow-point" />
                ))}
              </div>
              <div className="relative z-10">
                <p className="text-sm font-medium text-foreground mb-1">
                  <TypewriterText text={item.title} delay={i * 150} />
                </p>
                <p className="text-xs text-foreground/70">
                  <TypewriterText text={item.description} delay={i * 150 + 100} />
                </p>
                {item.link && (
                  <div className="flex items-center gap-1 mt-2 text-foreground/60 text-[10px]">
                    <ExternalLink className="w-3 h-3" />
                    <span className="truncate">
                      {(() => {
                        try {
                          return new URL(item.link).hostname;
                        } catch {
                          return "Link";
                        }
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default InfoCards;
