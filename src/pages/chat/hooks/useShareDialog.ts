import { useState } from "react";

/**
 * Encapsulates state for the chat share dialog (private/public links).
 * Extracted from ChatPage to reduce re-render surface.
 */
export function useShareDialog() {
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareMode, setShareMode] = useState<"private" | "public">("public");
  const [isShared, setIsShared] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string | null>(null);

  return {
    shareDialogOpen,
    setShareDialogOpen,
    shareMode,
    setShareMode,
    isShared,
    setIsShared,
    shareId,
    setShareId,
    generatedShareUrl,
    setGeneratedShareUrl,
  };
}
