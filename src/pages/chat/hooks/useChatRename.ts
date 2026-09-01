import { useState } from "react";

/**
 * Encapsulates state for renaming/pinning/deleting the current chat.
 * Extracted from ChatPage to reduce re-render surface.
 */
export function useChatRename() {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return {
    isRenaming,
    setIsRenaming,
    renameValue,
    setRenameValue,
    isPinned,
    setIsPinned,
    isDeleting,
    setIsDeleting,
  };
}
