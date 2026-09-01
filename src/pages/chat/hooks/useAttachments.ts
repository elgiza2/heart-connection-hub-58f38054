import { useRef, useState } from "react";

export type AttachedFile = { name: string; type: "image" | "video" | "file" | "link" | string; data: string };

/**
 * Encapsulates state for composer attachments and the hidden file/camera/image
 * input refs. Extracted from ChatPage to reduce re-render surface.
 */
export function useAttachments() {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  return {
    attachedFiles,
    setAttachedFiles,
    fileInputRef,
    cameraInputRef,
    imageInputRef,
  };
}
