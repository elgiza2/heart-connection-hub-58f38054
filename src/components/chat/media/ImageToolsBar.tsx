// شريط أدوات ثابت يظهر داخل الملحن في وضع Images:
// Upload image + Remove background + إعادة استخدام شخصية محفوظة.

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Eraser, Users, Loader2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { compressImageToDataUrl } from "@/lib/compressImage";
import { removeImageBackground, blobToDataUrl } from "@/lib/media/removeBackground";
import { upscaleImage } from "@/lib/media/upscaleImage";
import {
  listCharacters,
  forgetCharacter,
  type RememberedCharacter,
} from "@/lib/media/characterMemory";

interface Props {
  onAttach: (file: { name: string; type: "image"; data: string }) => void;
  onUseCharacter: (character: RememberedCharacter) => void;
}

export default function ImageToolsBar({ onAttach, onUseCharacter }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cutoutRef = useRef<HTMLInputElement>(null);
  const upscaleRef = useRef<HTMLInputElement>(null);
  const [upscaleFactor, setUpscaleFactor] = useState<2 | 4>(2);
  const [busy, setBusy] = useState(false);
  const [charsOpen, setCharsOpen] = useState(false);
  const [chars, setChars] = useState<RememberedCharacter[]>([]);

  useEffect(() => {
    if (charsOpen) setChars(listCharacters());
  }, [charsOpen]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { dataUrl } = await compressImageToDataUrl(file);
      onAttach({ name: file.name, type: "image", data: dataUrl });
    } catch {
      toast.error("Couldn't attach the image");
    }
  };

  const handleCutout = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    const toastId = toast.loading("Removing background…");
    try {
      const blob = await removeImageBackground(file);
      const dataUrl = await blobToDataUrl(blob);
      onAttach({ name: file.name.replace(/\.\w+$/, "") + "-no-bg.png", type: "image", data: dataUrl });
      toast.success("Background removed", { id: toastId });
    } catch {
      toast.error("Couldn't remove the background, try another image", { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const handleUpscale = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    const toastId = toast.loading(`Upscaling ×${upscaleFactor}…`);
    try {
      const res = await upscaleImage(file, upscaleFactor);
      onAttach({
        name: file.name.replace(/\.\w+$/, "") + `-upscaled-${upscaleFactor}x.png`,
        type: "image",
        data: res.dataUrl,
      });
      toast.success(`Upscaled to ${res.width}×${res.height}`, { id: toastId });
    } catch {
      toast.error("Couldn't upscale the image, try another one", { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium text-foreground/85 hover:text-foreground bg-foreground/[0.07] hover:bg-foreground/[0.12] border border-foreground/10 transition active:scale-[0.97] disabled:opacity-50";

  return (
    <div className="px-2 pt-2 pb-1 space-y-2" dir="auto">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => uploadRef.current?.click()} disabled={busy}>
          <ImagePlus className="w-3.5 h-3.5" />
          Upload image
        </button>
        <button type="button" className={btn} onClick={() => cutoutRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
          Remove background
        </button>
        <button type="button" className={btn} onClick={() => upscaleRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Upscale
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => setUpscaleFactor((v) => (v === 2 ? 4 : 2))}
          disabled={busy}
          aria-label="Change upscale factor"
        >
          ×{upscaleFactor}
        </button>
        <button type="button" className={btn} onClick={() => setCharsOpen((v) => !v)}>
          <Users className="w-3.5 h-3.5" />
          My characters
        </button>
      </div>

      {charsOpen && (
        <div className="max-h-40 overflow-y-auto rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-2 space-y-1">
          {chars.length === 0 ? (
            <div className="px-2 py-1.5 text-[12px] text-foreground/55">
              No saved characters yet — every image you generate saves its identity automatically.
            </div>
          ) : (
            chars.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUseCharacter(c);
                    setCharsOpen(false);
                  }}
                  className="flex-1 flex items-center gap-2 min-w-0 px-2 py-1.5 rounded-xl text-start hover:bg-foreground/[0.08] transition"
                >
                  {c.refUrl ? (
                    <img decoding="async"
                      src={c.refUrl}
                      alt=""
                      className="w-7 h-7 rounded-lg object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-lg bg-foreground/10 shrink-0" />
                  )}
                  <span className="truncate text-[12.5px] text-foreground/85">{c.name}</span>
                </button>
                <button
                  type="button"
                  aria-label="Delete character"
                  onClick={() => {
                    forgetCharacter(c.id);
                    setChars(listCharacters());
                  }}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <input ref={uploadRef} type="file" accept="image/*" hidden onChange={handleUpload} />
      <input ref={cutoutRef} type="file" accept="image/*" hidden onChange={handleCutout} />
      <input ref={upscaleRef} type="file" accept="image/*" hidden onChange={handleUpscale} />
    </div>
  );
}
