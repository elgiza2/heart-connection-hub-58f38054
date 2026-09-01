import { Lock, Globe, Copy, Pencil, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChatDesktopDialog } from "../ChatDesktopDialog";
import { translateExactText, useUserLang } from "@/lib/authI18n";

export interface ChatDialogsProps {
  // Share
  shareDialogOpen: boolean;
  setShareDialogOpen: (v: boolean) => void;
  shareMode: "private" | "public";
  setShareMode: (m: "private" | "public") => void;
  generatedShareUrl: string | null;
  setGeneratedShareUrl: (v: string | null) => void;
  handleCreateShareLink: (mode: "public") => void;
  handleCopyShareLink: () => void;

  // Rename
  isRenaming: boolean;
  setIsRenaming: (v: boolean) => void;
  renameValue: string;
  setRenameValue: (v: string) => void;
  handleRename: () => void;

  // Invite
  inviteDialogOpen: boolean;
  setInviteDialogOpen: (v: boolean) => void;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteLink: string | null;
  setInviteLink: (v: string | null) => void;
  inviteLoading: boolean;
  handleSendInviteEmail: () => void;
  handleCopyInviteLink: () => void;
  members: any[];
  chatUserId: string | null | undefined;
  conversationOwnerId: string | null | undefined;
  onlineUsers: Set<string>;
  colorForUser: (uid: string) => { bg?: string } | null;
  handleKickMember: (id: string) => void;
}

export function ChatDialogs(p: ChatDialogsProps) {
  const lang = useUserLang();
  const tx = (text: string) => translateExactText(text, lang);
  return (
    <>
      {/* Share Dialog */}
      <ChatDesktopDialog
        open={p.shareDialogOpen}
        onOpenChange={(open) => {
          p.setShareDialogOpen(open);
          if (!open) p.setGeneratedShareUrl(null);
        }}
      >
        <div className="px-5 pt-5 pb-3">
          <div className="mb-0 flex flex-col space-y-1.5 text-left">
            <h2 className="text-base font-semibold text-left text-foreground">{tx("Share chat")}</h2>
            <p className="text-xs text-left text-muted-foreground">
              {tx("Future messages aren't included")}
            </p>
          </div>
        </div>
        <div className="border-t border-border/30">
          <button
            onClick={() => {
              p.setShareMode("private");
              p.setGeneratedShareUrl(null);
            }}
            className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors ${p.shareMode === "private" ? "bg-accent/50" : "hover:bg-accent/30"}`}
          >
            <Lock className="w-4 h-4 text-foreground shrink-0" />
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{tx("Keep private")}</p>
              <p className="text-[11px] text-muted-foreground">{tx("Only you have access")}</p>
            </div>
          </button>
          <div className="h-px bg-border/30 mx-5" />
          <button
            onClick={() => {
              p.setShareMode("public");
              if (!p.generatedShareUrl) p.handleCreateShareLink("public");
            }}
            className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors ${p.shareMode === "public" ? "bg-accent/50" : "hover:bg-accent/30"}`}
          >
            <Globe className="w-4 h-4 text-foreground shrink-0" />
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{tx("Create public link")}</p>
              <p className="text-[11px] text-muted-foreground">{tx("Anyone with the link can view")}</p>
            </div>
          </button>
        </div>
        <div className="px-5 py-4 border-t border-border/30">
          {p.shareMode === "public" ? (
            p.generatedShareUrl ? (
              <div className="mx-auto flex items-center justify-center gap-2 max-w-full w-fit rounded-xl liquid-glass-button px-3 py-2.5 overflow-hidden">
                <span
                  className="text-[12px] font-medium text-foreground tracking-tight truncate min-w-0 max-w-[60vw]"
                  dir="ltr"
                >
                  {(() => {
                    try {
                      const u = new URL(p.generatedShareUrl);
                      const tail = u.pathname.split("/").pop() || "";
                      return `${u.host}/…/${tail.slice(0, 6)}`;
                    } catch {
                      return p.generatedShareUrl.slice(0, 24) + "…";
                    }
                  })()}
                </span>
                <button
                  onClick={p.handleCopyShareLink}
                  className="shrink-0 p-1.5 rounded-lg liquid-glass-hover transition-colors"
                  aria-label={tx("Copy")}
                >
                  <Copy className="w-3.5 h-3.5 text-foreground" />
                </button>
              </div>
            ) : (
              <p className="text-center text-[12px] text-muted-foreground">{tx("Generating link…")}</p>
            )
          ) : (
            <p className="text-center text-[12px] font-medium text-foreground">
              {tx("Everything stays private to you")}
            </p>
          )}
        </div>
      </ChatDesktopDialog>

      {/* Rename Dialog */}
      <ChatDesktopDialog open={p.isRenaming} onOpenChange={p.setIsRenaming}>
        <div className="px-5 pt-5 pb-3">
          <div className="mb-0 flex flex-col space-y-1.5 text-left">
            <h2 className="text-base font-semibold text-left text-foreground">{tx("Rename chat")}</h2>
            <p className="text-xs text-left text-muted-foreground">
              {tx("Give this conversation a new name")}
            </p>
          </div>
        </div>
        <div className="border-t border-border/30 px-5 py-4">
          <div className="flex items-center gap-3 rounded-xl liquid-glass-button px-3 py-2.5">
            <Pencil className="w-4 h-4 text-foreground shrink-0" />
            <input
              value={p.renameValue}
              onChange={(e) => p.setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && p.handleRename()}
              placeholder={tx("Chat name")}
              autoFocus
              className="flex-1 bg-transparent border-0 outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5 border-t border-border/30 pt-4">
          <button
            onClick={() => p.setIsRenaming(false)}
            className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground liquid-glass-hover transition-colors"
          >
            {tx("Cancel")}
          </button>
          <button
            onClick={p.handleRename}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            {tx("Save")}
          </button>
        </div>
      </ChatDesktopDialog>

      {/* Invite Dialog */}
      <ChatDesktopDialog
        open={p.inviteDialogOpen}
        onOpenChange={(open) => {
          p.setInviteDialogOpen(open);
          if (!open) {
            p.setInviteLink(null);
            p.setInviteEmail("");
          }
        }}
      >
        <div className="px-5 pt-5 pb-4">
          <div className="mb-0 flex flex-col space-y-1.5 text-left">
            <h2 className="text-base font-semibold text-left text-foreground">{tx("Invite people")}</h2>
            <p className="text-xs text-left text-muted-foreground mt-0.5">
              {tx("Add someone to chat together in this conversation")}
            </p>
          </div>
        </div>

        <div className="px-5 pb-4 border-t border-border/30 pt-4">
          <div className="flex items-center gap-2">
            <Input
              value={p.inviteEmail}
              onChange={(e) => p.setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
              className="flex-1 h-11 rounded-xl border-border/30 bg-accent/30 text-sm text-foreground placeholder:text-muted-foreground"
              onKeyDown={(e) => e.key === "Enter" && p.handleSendInviteEmail()}
            />
            <button
              onClick={p.handleSendInviteEmail}
              disabled={p.inviteLoading || !p.inviteEmail.trim()}
              className="px-4 h-11 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40">
              {p.inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : tx("Invite")}
            </button>
          </div>
        </div>

        <div className="px-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {tx("or share link")}
          </span>
          <div className="flex-1 h-px bg-border/40" />
        </div>

        <div className="px-5 pt-4 pb-5">
          {p.inviteLink ? (
            <div className="flex items-center gap-2 w-full rounded-xl liquid-glass-button px-3 py-2.5">
              <input
                readOnly
                value={p.inviteLink}
                dir="ltr"
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-transparent outline-none text-[12px] font-medium text-foreground tracking-tight"
              />
              <button
                onClick={p.handleCopyInviteLink}
                className="shrink-0 p-1.5 rounded-lg liquid-glass-hover transition-colors"
                aria-label={tx("Copy")}
              >
                <Copy className="w-3.5 h-3.5 text-foreground" />
              </button>
            </div>
          ) : (
            <p className="text-center text-[12px] text-muted-foreground">{tx("Generating link…")}</p>
          )}
        </div>

        {p.members.length > 0 && (
          <div className="px-5 py-4 border-t border-border/30">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {tx("People with access")} ({p.members.length + 1})
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 py-1">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-semibold text-primary">
                  {tx("You")}
                </div>
                <span className="text-xs text-foreground">{tx("Owner")}</span>
              </div>
              {p.members.map((m) => {
                const c = p.colorForUser(m.id);
                const isOwner = p.chatUserId && p.conversationOwnerId === p.chatUserId;
                const isOnline = p.onlineUsers.has(m.id);
                return (
                  <div key={m.id} className="flex items-center gap-2 py-1">
                    <div className="relative">
                      {m.avatar ? (
                        <img loading="lazy" decoding="async" src={m.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-foreground"
                          style={{ background: c?.bg || "hsl(var(--accent))" }}
                        >
                          {(m.name || "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      {isOnline && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white"
                          title={tx("Online")}
                        />
                      )}
                    </div>
                    <span className="text-xs text-foreground flex-1 truncate">
                       {m.name || tx("Member")}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                       {isOnline ? tx("online") : tx(m.role)}
                    </span>
                    {isOwner && (
                      <button
                        onClick={() => p.handleKickMember(m.id)}
                        className="ml-1 px-2 py-1 rounded-md text-[11px] font-semibold text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        {tx("Remove")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ChatDesktopDialog>
    </>
  );
}
