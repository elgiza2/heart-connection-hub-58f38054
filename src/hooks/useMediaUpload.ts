import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MediaKind = "photo" | "video" | "document" | "audio" | "voice" | "animation";

export interface UploadedMedia {
  id: string;
  url: string;
  provider: "telegram" | "supabase";
  kind: MediaKind;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  size_bytes?: number | null;
  mime_type?: string | null;
}

export interface UploadOptions {
  kind?: MediaKind;
  caption?: string;
}

function inferKind(file: File): MediaKind {
  const t = file.type.toLowerCase();
  if (t.startsWith("image/gif")) return "animation";
  if (t.startsWith("image/")) return "photo";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return t.includes("ogg") || t.includes("opus") ? "voice" : "audio";
  return "document";
}

export function useMediaUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, opts: UploadOptions = {}): Promise<UploadedMedia> => {
      setUploading(true);
      setError(null);
      setProgress(0);

      try {
        const kind = opts.kind ?? inferKind(file);
        const form = new FormData();
        form.append("file", file);
        form.append("kind", kind);
        if (opts.caption) form.append("caption", opts.caption);

        const { data, error } = await supabase.functions.invoke(
          "telegram-tasks-bot/storage-upload",
          {
            body: form,
          },
        );

        if (error) throw error;
        if (!data?.url) throw new Error("Upload failed: no URL returned");

        setProgress(100);
        return data as UploadedMedia;
      } catch (e: any) {
        const msg = e?.message || String(e);
        setError(msg);
        throw e;
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const refreshUrl = useCallback(async (mediaId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("telegram-tasks-bot/storage-refresh", {
      body: { media_id: mediaId },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("Failed to refresh URL");
    return data.url as string;
  }, []);

  return { upload, refreshUrl, uploading, progress, error };
}
