import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseUploadedFile } from "@/lib/parseUploadedFile";
import { compressImageToDataUrl } from "@/lib/compressImage";
import type { AttachedFile } from "./useAttachments";

async function attachCompressedImage(
  file: File,
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>,
) {
  try {
    const { dataUrl } = await compressImageToDataUrl(file);
    setAttachedFiles((prev) => [
      ...prev,
      { name: file.name, type: "image", data: dataUrl },
    ]);
  } catch {
    // ignore — user can re-attach
  }
}

/**
 * Bundles the three composer-attachment entry points (general file picker,
 * image-only picker, and camera capture) into a single hook so ChatPage
 * doesn't have to babysit FileReader plumbing.
 */
export function useComposerUploads(params: {
  attachedFiles: AttachedFile[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  conversationId: string | null;
  createOrUpdateConversation: (firstMessage: string) => Promise<string | null>;
}) {
  const { attachedFiles, setAttachedFiles, conversationId, createOrUpdateConversation } = params;

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const fileList = Array.from(files);
      if (attachedFiles.length + fileList.length > 5) {
        toast.error("Maximum 5 files per message");
        e.target.value = "";
        return;
      }
      for (const file of fileList) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 20MB)`);
          continue;
        }
        if (file.size === 0) {
          toast.error(`${file.name} is empty`);
          continue;
        }
        if (file.type.startsWith("image/")) {
          await attachCompressedImage(file, setAttachedFiles);
        } else if (file.type.startsWith("video/")) {
          const placeholderId = `__uploading_${file.name}_${Date.now()}`;
          setAttachedFiles((prev) => [
            ...prev,
            { name: `${file.name} (uploading…)`, type: "video", data: placeholderId },
          ]);
          try {
            const url = await uploadVideoToStorage(file);
            if (!url) throw new Error("upload failed");
            setAttachedFiles((prev) =>
              prev.map((f) =>
                f.type === "video" && f.data === placeholderId
                  ? { name: file.name, type: "video", data: url }
                  : f,
              ),
            );
            toast.success(`Uploaded ${file.name}`);
          } catch {
            setAttachedFiles((prev) =>
              prev.filter((f) => !(f.type === "video" && f.data === placeholderId)),
            );
            toast.error(`Could not upload ${file.name}`);
          }
        } else {
          const placeholderId = `__parsing_${file.name}_${Date.now()}`;
          setAttachedFiles((prev) => [
            ...prev,
            { name: `${file.name} (analyzing…)`, type: "file", data: placeholderId },
          ]);
          try {
            const text = await parseUploadedFile(file);
            setAttachedFiles((prev) =>
              prev.map((f) =>
                f.type === "file" && f.data === placeholderId
                  ? { name: file.name, type: "file", data: text }
                  : f,
              ),
            );
            toast.success(`Analyzed ${file.name}`);
            if (text && text.length > 800) {
              const convId = conversationId || (await createOrUpdateConversation(file.name));
              if (convId) {
                void supabase.functions
                  .invoke("chat-alibaba", {
                    body: {
                      action: "ingest_attachment",
                      conversation_id: convId,
                      file_name: file.name,
                      text,
                    },
                  })
                  .catch(() => {});
              }
            }
          } catch {
            setAttachedFiles((prev) =>
              prev.filter((f) => !(f.type === "file" && f.data === placeholderId)),
            );
            toast.error(`Could not read ${file.name}`);
          }
        }
      }
      e.target.value = "";
    },
    [attachedFiles.length, setAttachedFiles, conversationId, createOrUpdateConversation],
  );

  const uploadVideoToStorage = useCallback(
    async (file: File): Promise<string | null> => {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const uid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const path = `chat-videos/${uid}.${ext}`;
      const { error } = await supabase.storage
        .from("user-images")
        .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
      if (error) {
        console.error("[video upload] failed", error);
        return null;
      }
      const { data } = supabase.storage.from("user-images").getPublicUrl(path);
      return data?.publicUrl ?? null;
    },
    [],
  );

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const fileList = Array.from(files);
      if (attachedFiles.length + fileList.length > 5) {
        toast.error("Maximum 5 files per message");
        e.target.value = "";
        return;
      }
      for (const file of fileList) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 20MB)`);
          continue;
        }
        if (file.size === 0) {
          toast.error(`${file.name} is empty`);
          continue;
        }
        if (file.type.startsWith("video/")) {
          // Background upload → public URL, then attach as { type: "video", data: URL }.
          const placeholderId = `__uploading_${file.name}_${Date.now()}`;
          setAttachedFiles((prev) => [
            ...prev,
            { name: `${file.name} (uploading…)`, type: "video", data: placeholderId },
          ]);
          try {
            const url = await uploadVideoToStorage(file);
            if (!url) throw new Error("upload failed");
            setAttachedFiles((prev) =>
              prev.map((f) =>
                f.type === "video" && f.data === placeholderId
                  ? { name: file.name, type: "video", data: url }
                  : f,
              ),
            );
            toast.success(`Uploaded ${file.name}`);
          } catch {
            setAttachedFiles((prev) =>
              prev.filter((f) => !(f.type === "video" && f.data === placeholderId)),
            );
            toast.error(`Could not upload ${file.name}`);
          }
          continue;
        }
        // Image: compress → base64 data URL.
        await attachCompressedImage(file, setAttachedFiles);
      }
      e.target.value = "";
    },
    [attachedFiles.length, setAttachedFiles, uploadVideoToStorage],
  );

  const handleCameraCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (attachedFiles.length >= 5) {
        toast.error("Maximum 5 files per message");
        e.target.value = "";
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 20MB)`);
        e.target.value = "";
        return;
      }
      await attachCompressedImage(file, setAttachedFiles);
      e.target.value = "";
    },
    [attachedFiles.length, setAttachedFiles],
  );

  return { handleFileUpload, handleImageUpload, handleCameraCapture };
}
