import {
  ChevronLeft,
  Copy,
  Globe,
  Loader2,
  Lock,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  Share2,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { t as uiT, translateExactText, useUserLang } from "@/lib/authI18n";

export type ChatMenuView = "main" | "rename" | "invite" | "share" | "delete" | "pin";

interface ChatOptionsDropdownProps {
  variant: "desktop" | "mobile";
  chatMenuView: ChatMenuView;
  setChatMenuView: (v: ChatMenuView) => void;
  conversationId: string | null;
  conversationTitle: string;
  isPinned: boolean;
  isDeleting: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteLink: string | null;
  inviteLoading: boolean;
  shareMode: "private" | "public";
  setShareMode: (m: "private" | "public") => void;
  generatedShareUrl: string | null;
  setGeneratedShareUrl: (v: string | null) => void;
  onNewChat: () => void;
  onTogglePin: () => unknown | Promise<unknown>;
  onRename: () => unknown | Promise<unknown>;
  onSendInvite: () => unknown | Promise<unknown>;
  onCopyInviteLink: () => void;
  onCopyShareLink: () => void;
  onCreateShareLink: (mode: "private" | "public") => unknown | Promise<unknown>;
  onOpenInvite: () => unknown | Promise<unknown>;
  onConfirmDelete: () => unknown | Promise<unknown>;
}

export function ChatOptionsDropdown(props: ChatOptionsDropdownProps) {
  const {
    variant,
    chatMenuView,
    setChatMenuView,
    conversationId,
    conversationTitle,
    isPinned,
    isDeleting,
    renameValue,
    setRenameValue,
    inviteEmail,
    setInviteEmail,
    inviteLink,
    inviteLoading,
    shareMode,
    setShareMode,
    generatedShareUrl,
    setGeneratedShareUrl,
    onNewChat,
    onTogglePin,
    onRename,
    onSendInvite,
    onCopyInviteLink,
    onCopyShareLink,
    onCreateShareLink,
    onOpenInvite,
    onConfirmDelete,
  } = props;

  const isDesktop = variant === "desktop";
  const lang = useUserLang();
  const tx = (text: string) => translateExactText(text, lang);

  const mainItems: Array<{
    icon: typeof Plus;
    label: string;
    onClick: () => void;
    keepOpen: boolean;
  }> = [
    { icon: Plus, label: uiT("newChat", lang), onClick: onNewChat, keepOpen: false },
    {
      icon: UserPlus,
      label: tx("Invite people"),
      onClick: () => {
        setChatMenuView("invite");
        void onOpenInvite();
      },
      keepOpen: true,
    },
    {
      icon: Share2,
      label: tx("Share"),
      onClick: () => {
        setChatMenuView("share");
        if (conversationId && !generatedShareUrl) {
          void onCreateShareLink("public");
        }
      },
      keepOpen: true,
    },
    {
      icon: Pencil,
      label: tx("Rename"),
      onClick: () => {
        setRenameValue(conversationTitle);
        setChatMenuView("rename");
      },
      keepOpen: true,
    },
    {
      icon: Pin,
      label: isPinned ? tx("Unpin chat") : tx("Pin chat"),
      onClick: () => {
        void onTogglePin();
      },
      keepOpen: false,
    },
  ];

  return (
    <DropdownMenu
      onOpenChange={(o) => {
        if (!o) setChatMenuView("main");
      }}
    >
      <DropdownMenuTrigger asChild>
        {isDesktop ? (
          <button
            aria-label={tx("Chat options")}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[14px] font-black text-foreground bg-card border border-border hover:bg-muted active:translate-x-[2px] active:translate-y-[2px] transition-all"
          >
            <MoreHorizontal className="w-[18px] h-[18px] text-foreground" strokeWidth={2.4} />
          </button>

        ) : (
          <button
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-full text-brand-ink bg-brand-action border-2 border-brand-ink shadow-[2px_2px_0_rgba(59,130,246,0.35)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
            aria-label={tx("More options")}
          >
            <MoreVertical className="w-[20px] h-[20px]" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isDesktop ? "start" : "end"}
        sideOffset={isDesktop ? 6 : 8}
        className={`${isDesktop ? "w-[18rem]" : "w-[min(18.5rem,calc(100vw-18px))]"} chat-options-glass-menu rounded-[24px] p-1.5 text-foreground`}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {chatMenuView === "main" && (
          <>
            {mainItems.map(({ icon: Icon, label, onClick, keepOpen }) => (
              <DropdownMenuItem
                key={label}
                onSelect={(e) => {
                  if (keepOpen) e.preventDefault();
                  onClick();
                }}
                className="chat-options-glass-item rounded-[16px] px-2.5 py-2.5 text-[14px] gap-3 cursor-pointer font-semibold text-foreground focus:bg-foreground/10 data-[highlighted]:bg-foreground/10"
              >
                <span className="w-8 h-8 flex items-center justify-center shrink-0">
                  <Icon className="w-[17px] h-[17px] text-foreground/85" strokeWidth={2} />
                </span>
                <span className="flex-1 truncate">{label}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="my-1.5 bg-foreground/12" />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setChatMenuView("delete");
              }}
              className="chat-options-glass-item rounded-[16px] px-2.5 py-2.5 text-[14px] gap-3 cursor-pointer font-semibold text-destructive focus:text-destructive data-[highlighted]:bg-destructive/10"
            >
              <span className="w-8 h-8 flex items-center justify-center shrink-0">
                <Trash2 className="w-[17px] h-[17px]" strokeWidth={1.9} />
              </span>
              <span className="flex-1 truncate">{tx("Delete chat")}</span>
            </DropdownMenuItem>
          </>
        )}

        {chatMenuView === "rename" && (
          <div className="p-2">
            <BackButton onBack={() => setChatMenuView("main")} />
            <div className="text-[13px] font-black text-brand-parchment mb-2 px-1">{tx("Rename chat")}</div>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void onRename();
                  setChatMenuView("main");
                }
              }}
              autoFocus
              className="h-9 rounded-xl text-sm bg-surface-3 border-2 border-surface-4 text-brand-parchment"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setChatMenuView("main")}
                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground"
              >
                {tx("Cancel")}
              </button>
              <button
                onClick={() => {
                  void onRename();
                  setChatMenuView("main");
                }}
                className="px-3 py-1.5 rounded-full text-xs font-black bg-brand-action text-brand-ink border-2 border-brand-ink"
              >
                {tx("Save")}
              </button>
            </div>
          </div>
        )}

        {chatMenuView === "invite" && (
          <div className="p-2">
            <BackButton onBack={() => setChatMenuView("main")} />
            <div className="text-[13px] font-black text-brand-parchment mb-1 px-1">
              {tx("Invite people")}
            </div>
            <p className="text-[11px] text-brand-muted font-semibold mb-3 px-1">
              {tx("Add someone to this conversation")}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={tx("friend@example.com")}
                className="flex-1 h-9 rounded-xl text-sm bg-surface-3 border-2 border-surface-4 text-brand-parchment"
                onKeyDown={(e) => e.key === "Enter" && onSendInvite()}
              />
              <button
                onClick={() => void onSendInvite()}
                disabled={inviteLoading || !inviteEmail.trim()}
                className="px-3 h-9 rounded-full text-xs font-black bg-brand-action text-brand-ink border-2 border-brand-ink disabled:opacity-40"
              >
                {inviteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tx("Invite")}
              </button>
            </div>
            {inviteLink ? (
              <button
                onClick={onCopyInviteLink}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-surface-3 border-2 border-surface-4 transition-colors"
      aria-label="Copy"
    >
                <span className="text-[11.5px] text-foreground truncate" dir="ltr">
                  {inviteLink}
                </span>
                <Copy className="w-3.5 h-3.5 text-foreground shrink-0" />
              </button>
            ) : (
              <p className="text-center text-[11px] text-muted-foreground py-2">{tx("Generating link…")}</p>
            )}
          </div>
        )}

        {chatMenuView === "share" && (
          <div className="p-2">
            <BackButton onBack={() => setChatMenuView("main")} />
            <div className="text-[13px] font-black text-brand-parchment mb-1 px-1">{tx("Share chat")}</div>
            <p className="text-[11px] text-brand-muted font-semibold mb-3 px-1">
              {tx("Future messages aren't included")}
            </p>
            <div className="rounded-xl border-2 border-surface-4 overflow-hidden">
              <button
                onClick={() => {
                  setShareMode("private");
                  setGeneratedShareUrl(null);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors ${
                  shareMode === "private" ? "bg-accent/50" : "hover:bg-accent/30"
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-foreground shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground">{tx("Keep private")}</p>
                  <p className="text-[10.5px] text-muted-foreground">{tx("Only you have access")}</p>
                </div>
              </button>
              <div className="h-px bg-border/40" />
              <button
                onClick={() => {
                  setShareMode("public");
                  if (!generatedShareUrl) void onCreateShareLink("public");
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors ${
                  shareMode === "public" ? "bg-accent/50" : "hover:bg-accent/30"
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-foreground shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground">{tx("Create public link")}</p>
                  <p className="text-[10.5px] text-muted-foreground">
                    {tx("Anyone with the link can view")}
                  </p>
                </div>
              </button>
            </div>
            {shareMode === "public" && (
              <div className="mt-3">
                {generatedShareUrl ? (
                  <button
                    onClick={onCopyShareLink}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-accent/40 hover:bg-accent/60 transition-colors"
      aria-label="Copy"
    >
                    <span className="text-[11.5px] text-foreground truncate" dir="ltr">
                      {generatedShareUrl}
                    </span>
                    <Copy className="w-3.5 h-3.5 text-foreground shrink-0" />
                  </button>
                ) : (
                  <p className="text-center text-[11px] text-muted-foreground py-1">
                    {tx("Generating link…")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {chatMenuView === "delete" && (
          <div className="p-2">
            <BackButton onBack={() => setChatMenuView("main")} />
            <div className="text-[13px] font-semibold text-foreground mb-1 px-1">{tx("Delete chat?")}</div>
            <p className="text-[11px] text-muted-foreground mb-3 px-1">
              {tx("This conversation will be permanently removed. This action cannot be undone.")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setChatMenuView("main")}
                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground"
              >
                {tx("Cancel")}
              </button>
              <button
                onClick={() => {
                  void onConfirmDelete();
                }}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {tx("Delete")}
              </button>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  const lang = useUserLang();
  const backLabel = translateExactText("Back", lang);
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground mb-2"
      aria-label="Chevron Left"
    >
      <ChevronLeft className="w-3.5 h-3.5" /> {backLabel}
    </button>
  );
}
