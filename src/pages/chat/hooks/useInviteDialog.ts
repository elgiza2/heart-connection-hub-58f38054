import { useState } from "react";

export type ChatMember = {
  id: string;
  email: string;
  role: string;
  name?: string;
  avatar?: string;
};

/**
 * Encapsulates state for the invite dialog (collaborator invites + links).
 * Extracted from ChatPage to reduce re-render surface.
 */
export function useInviteDialog() {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [members, setMembers] = useState<ChatMember[]>([]);

  return {
    inviteDialogOpen,
    setInviteDialogOpen,
    inviteEmail,
    setInviteEmail,
    inviteLoading,
    setInviteLoading,
    inviteLink,
    setInviteLink,
    members,
    setMembers,
  };
}
