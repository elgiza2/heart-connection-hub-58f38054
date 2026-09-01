import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { promptUpgrade } from "@/lib/upgradeMoment";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useDynamicModels } from "@/hooks/useModels";
import { Check, Image as ImageIcon, Video as VideoIcon, Lock } from "lucide-react";
import { glassModelMenu, glassModelMenuStyle } from "@/components/model-picker/glassModelMenuStyles";
import { BrandIcon, hasBrandIcon } from "@/components/chat/media/BrandIcon";
import { useUserPlan } from "@/hooks/useUserPlan";
import { isFreeModel, isPaidUser } from "@/lib/subscriptionGating";
import { filterImageModels, filterVideoModels } from "@/lib/mediaModelPolicy";
import { isUnlimitedMediaModel, mediaModelBadge } from "@/lib/mediaQuota";

/**
 * Neutral monogram used when a model has no brand icon or thumbnail.
 * (Previously these fell back to the Megsy logo, which made third-party
 * video models look like our own products.)
 */
function ModelMonogram({ name, size = 64 }: { name: string; size?: number }) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-xl bg-foreground/8 text-foreground/70 font-black"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {letter}
    </span>
  );
}



export interface MediaModelChoice {
  slug: string;
  name: string;
  provider: string;
  credits: number;
  thumbnail?: string;
  type: "image" | "video";
  isPremium?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "images" | "video";
  selectedSlug?: string;
  onSelect: (model: MediaModelChoice) => void;
}

export default function MediaModelPickerSheet({
  open,
  onOpenChange,
  mode,
  selectedSlug,
  onSelect,
}: Props) {
  const { models, loading } = useDynamicModels();
  const { plan } = useUserPlan();
  const paid = isPaidUser(plan);
  const navigate = useNavigate();


  const filtered = useMemo(() => {
    const target = mode === "video" ? ["video", "video-i2v"] : ["image"];
    const scoped = models.filter((m) => target.includes(m.type as string));
    return (mode === "video" ? filterVideoModels(scoped) : filterImageModels(scoped))
      .sort((a, b) => {
        const fa = a.isFeatured ? 1 : 0;
        const fb = b.isFeatured ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return (a.credits || 0) - (b.credits || 0);
      });
  }, [models, mode]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={`h-[78dvh] ${glassModelMenu.bottomSheet}`}
        style={glassModelMenuStyle}
      >
        <SheetHeader className="px-5 pt-4 pb-3 border-b border-foreground/10">
          <SheetTitle className="flex items-center gap-2 text-base font-black text-foreground">
            {mode === "video" ? (
              <VideoIcon className="w-4 h-4" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            {mode === "video" ? "Choose video model" : "Choose image model"}
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(78dvh-60px)]">
          <div className="p-3 grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5">
            {loading && (
              <div className="col-span-2 text-center py-10 text-sm text-muted-foreground">
                Loading models…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="col-span-2 text-center py-10 text-sm text-muted-foreground">
                No models available right now
              </div>
            )}
            {filtered.map((m) => {
              const active = m.slug === selectedSlug;
              const modelIsFree = isFreeModel(m.slug || m.id);
              const locked = !modelIsFree && !paid;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (locked) {
                      promptUpgrade(m.name);
                      onOpenChange(false);
                      navigate("/pricing");
                      return;
                    }
                    onSelect({
                      slug: m.slug || m.id,
                      name: m.name,
                      provider: m.provider,
                      credits: m.credits,
                      thumbnail: m.thumbnailUrl || m.iconUrl,
                      type: mode === "video" ? "video" : "image",
                      isPremium: !!m.isPremium,
                    });
                    toast.success(`Selected: ${m.name}`);
                  }}
                  className={glassModelMenu.card(active, "text-start rounded-[20px] active:scale-[0.98] relative")}
                >
                  {locked && (
                    <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-400/25 text-amber-500 border border-amber-400/30">
                      <Lock className="w-2.5 h-2.5" /> Pro
                    </span>
                  )}

                  <div className="aspect-[4/3] w-full rounded-xl overflow-hidden mb-2 flex items-center justify-center">
                    {m.thumbnailUrl ? (
                      <img decoding="async"
                        src={m.thumbnailUrl}
                        alt={m.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : hasBrandIcon(m.name, m.provider) ? (
                      <BrandIcon name={m.name} provider={m.provider} size={64} variant="color" />
                    ) : (
                      <ModelMonogram name={m.name} size={56} />
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 flex items-center gap-1.5">
                      {hasBrandIcon(m.name, m.provider) ? (
                        <BrandIcon name={m.name} provider={m.provider} size={16} variant="color" className="shrink-0" />
                      ) : (
                        <ModelMonogram name={m.name} size={16} />
                      )}
                      <div className="font-black text-sm truncate text-foreground">
                        {m.name}
                      </div>
                    </div>
                    {active && <Check className="w-4 h-4 text-brand-action shrink-0 mt-0.5" />}
                  </div>
                  <div className="mt-1.5">
                    <span
                      className={
                        isUnlimitedMediaModel(m) || mode === "images"
                          ? "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/25"
                          : "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-foreground/8 text-muted-foreground border border-foreground/10"
                      }
                    >
                      {mediaModelBadge(m, mode === "video" ? "video" : "image")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
