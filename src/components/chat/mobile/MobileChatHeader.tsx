import { useState, type RefObject } from "react";
import { AnimatePresence, m as motion } from "framer-motion";

import { useNavigate } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/common/PrefetchLink";
import {
  ChevronRight,
  Copy,
  Globe,
  Loader2,
  Lock,
  MoreVertical,
  Plus,
  Share2,
  UserPlus,
  Pencil,
  Pin,
  Star,
  FolderPlus,
  Send,
  Trash2,
} from "lucide-react";
import { prefetchRoute } from "@/hooks/usePrefetchRoute";
import { t as uiT, useUserLang } from "@/lib/authI18n";
import { UpgradePlanButton } from "@/components/billing/UpgradePlanButton";


type MenuView = "main" | "rename" | "invite" | "share" | "delete";

const MEGSY_APP_ICON = "/favicon.png";

const MegsySidebarToggleIcon = () => (
  // Clear sidebar/panel-left icon: panel outline with a left rail + content lines
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className="h-[22px] w-[22px]"
  >
    <rect
      x="3.25"
      y="4.5"
      width="17.5"
      height="15"
      rx="3.5"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <line x1="9.25" y1="4.5" x2="9.25" y2="19.5" stroke="currentColor" strokeWidth="1.6" />
    <line
      x1="5.5"
      y1="9"
      x2="7"
      y2="9"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <line
      x1="5.5"
      y1="12"
      x2="7"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <line
      x1="5.5"
      y1="15"
      x2="7"
      y2="15"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const NewChatComposeIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="h-[22px] w-[22px] text-foreground"
  >
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
  </svg>
);

export interface MobileChatHeaderProps {
  title?: string;
  hasConversation: boolean;
  isPinned?: boolean;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  onShare: () => void;
  onInvite: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void | Promise<void>;
  isDeleting?: boolean;
  rightSlot?: React.ReactNode;
  modelSlot?: React.ReactNode;
  chatUserId?: string | null;
  scrollContainerRef?: RefObject<HTMLElement | null>;


  // Inline view props (optional — when present, Share/Invite/Rename open inside the same menu)
  inlineRename?: {
    value: string;
    onChange: (v: string) => void;
    onSave: () => void;
  };
  inlineInvite?: {
    email: string;
    onEmailChange: (v: string) => void;
    onSend: () => void;
    loading?: boolean;
    link?: string | null;
    onCopyLink: () => void;
    onOpen: () => void;
  };
  inlineShare?: {
    mode: "private" | "public";
    onModeChange: (m: "private" | "public") => void;
    url?: string | null;
    onCopyLink: () => void;
    onOpen: () => void;
  };
}

export default function MobileChatHeader({
  hasConversation,
  isPinned,
  onOpenSidebar,
  onNewChat,
  onShare,
  onInvite,
  onRename,
  onTogglePin,
  onDelete,
  isDeleting,
  rightSlot,
  modelSlot,
  chatUserId,
  inlineRename,

  inlineInvite,
  inlineShare,
}: MobileChatHeaderProps) {
  const [open, setOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>("main");
  const navigate = useNavigate();


  const lang = useUserLang();
  const prefetchPricing = () => {
    void prefetchRoute("/pricing");
  };

  const close = () => {
    setOpen(false);
    setMenuView("main");
  };
  const runAndClose = (fn: () => void) => {
    setOpen(false);
    setMenuView("main");
    setTimeout(fn, 60);
  };

  const goRename = () => {
    if (inlineRename) {
      onRename();
      setMenuView("rename");
    } else runAndClose(onRename);
  };
  const goInvite = () => {
    if (inlineInvite) {
      inlineInvite.onOpen();
      setMenuView("invite");
    } else runAndClose(onInvite);
  };
  const goShare = () => {
    if (inlineShare) {
      inlineShare.onOpen();
      setMenuView("share");
    } else runAndClose(onShare);
  };

  const items: Array<{ icon: typeof Share2; label: string; onClick: () => void }> = [
    { icon: Share2, label: "Share", onClick: goShare },
    { icon: UserPlus, label: "Invite people", onClick: goInvite },
    { icon: Pin, label: isPinned ? "Unpin chat" : "Pin chat", onClick: () => runAndClose(onTogglePin) },
    { icon: Pencil, label: "Rename", onClick: goRename },
  ];

  const confirmDelete = async () => {
    await onDelete();
    close();
  };

  return (
    <>
      <div
        data-testid="mobile-chat-header"
        style={{ top: "var(--promo-banner-h, 0px)" }}
        className="mobile-chat-header md:hidden fixed inset-x-0 z-30 flex items-center gap-2 px-3 py-1.5 min-h-[44px] pt-[max(env(safe-area-inset-top),0.25rem)] pointer-events-none [&>*]:pointer-events-auto bg-transparent border-0"

      >
        <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open menu"
            data-testid="mobile-open-sidebar"
            className="w-11 h-11 rounded-full flex items-center justify-center text-foreground active:scale-95 transition bg-transparent border-0"
          >
            <MegsySidebarToggleIcon />
        </button>

        {/* Layout stays identical whether or not the list is scrolled: moving
            these around mid-scroll made the agent selector jump and produced a
            visible shake right after the first message. */}
        <div className="flex min-w-0 items-center">
          {modelSlot}
        </div>

        <div className="flex-1" />

        {/* Caller-provided actions (e.g. an upgrade CTA). */}
        {rightSlot}

        {chatUserId && (
          <UpgradePlanButton variant="compact" hideCredits />
        )}


        {!chatUserId && (
          <button
            type="button"
            onClick={() => navigate("/auth")}
            className="btn-sunset h-9 px-4 rounded-2xl text-[13px] font-bold active:scale-95 transition mb-0.5"
          >
            {uiT("Sign in", lang)}
          </button>
        )}
      </div>


      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="lg-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="md:hidden fixed inset-0 z-40 bg-transparent touch-none"
              onClick={() => {
                if (!isDeleting) close();
              }}
            />

            <motion.div
              key="lg-menu"
              data-testid="mobile-more-menu-content"
              initial={{ opacity: 0, scale: 0.92, y: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 0 }}
              transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
              style={{
                top: "calc(var(--promo-banner-h, 0px) + max(env(safe-area-inset-top), 0.25rem) + 0.375rem)",
                right: "12px",
                left: "auto",
                transformOrigin: "top right",
              }}
              className="mobile-more-glass-menu md:hidden fixed z-50 w-[260px] rounded-ios-lg overflow-hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                {menuView === "main" && (
                  <motion.div
                    key="menu-main"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="py-1.5"
                  >
                    {items.map(({ icon: Icon, label, onClick }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={onClick}
                        data-testid={`mobile-menu-${label.toLowerCase().replace(/\s+/g, "-")}`}
                        className="mobile-more-glass-item w-full flex items-center gap-3 px-4 py-3 transition-colors active:bg-foreground/[0.08] text-foreground">
                        <Icon
                          className="w-[19px] h-[19px] text-foreground shrink-0"
                          strokeWidth={1.8}
                        />
                        <span className="flex-1 truncate text-[15px] font-medium text-left">
                          {label}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMenuView("delete")}
                      data-testid="mobile-menu-delete"
                       className="mobile-more-glass-item w-full flex items-center gap-3 px-4 py-3 transition-colors active:bg-destructive/10 text-destructive"
                    >
                      <Trash2 className="w-[19px] h-[19px] shrink-0" strokeWidth={1.8} />
                      <span className="flex-1 truncate text-[15px] font-medium text-left">
                        Delete
                      </span>
                    </button>
                  </motion.div>
                )}

                {menuView === "rename" && inlineRename && (
                  <motion.div
                    key="menu-rename"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="p-3"
                  >
                    <BackButton onClick={() => setMenuView("main")} />
                    <div className="px-1 pb-2 text-right text-[14px] font-semibold text-foreground">
                      Rename chat
                    </div>
                    <input
                      autoFocus
                      dir="auto"
                      value={inlineRename.value}
                      onChange={(e) => inlineRename.onChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          inlineRename.onSave();
                          close();
                        }
                      }}
                      className="w-full h-10 rounded-xl bg-foreground/[0.06] border border-foreground/10 px-3 text-[14px] text-foreground outline-none focus:border-foreground/25"
                    />
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => setMenuView("main")}
                        className="flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-muted-foreground active:bg-foreground/[0.08]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          inlineRename.onSave();
                          close();
                        }}
                        className="flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold bg-primary text-primary-foreground active:opacity-90"
                      >
                        Save
                      </button>
                    </div>
                  </motion.div>
                )}

                {menuView === "invite" && inlineInvite && (
                  <motion.div
                    key="menu-invite"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="p-3"
                  >
                    <BackButton onClick={() => setMenuView("main")} />
                    <div className="px-1 pb-1 text-right text-[14px] font-semibold text-foreground">
                      Invite people
                    </div>
                    <p className="px-1 pb-2 text-right text-[11px] text-muted-foreground">
                      Add someone to this chat
                    </p>
                    <div className="flex flex-col gap-2">
                      <input
                        dir="ltr"
                        value={inlineInvite.email}
                        onChange={(e) => inlineInvite.onEmailChange(e.target.value)}
                        placeholder="friend@example.com"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") inlineInvite.onSend();
                        }}
                        className="w-full h-10 rounded-xl bg-foreground/[0.06] border border-foreground/10 px-3 text-[13px] text-foreground outline-none focus:border-foreground/25"
                      />
                      <button
                        type="button"
                        onClick={inlineInvite.onSend}
                        disabled={inlineInvite.loading || !inlineInvite.email.trim()}
                        className="w-full h-10 rounded-xl text-[13px] font-semibold bg-white text-background shadow-sm active:opacity-90 disabled:opacity-50 inline-flex items-center justify-center whitespace-nowrap theme-fixed">
                        {inlineInvite.loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          "Send invite"
                        )}
                      </button>
                    </div>
                    {inlineInvite.link ? (
                      <button
                        type="button"
                        onClick={inlineInvite.onCopyLink}
                        className="mt-2 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-foreground/[0.06] active:bg-foreground/[0.10]"
      aria-label="Copy"
    >
                        <span className="text-[11px] text-foreground truncate" dir="ltr">
                          {inlineInvite.link}
                        </span>
                        <Copy className="w-3.5 h-3.5 text-foreground shrink-0" />
                      </button>
                    ) : (
                      <p className="mt-2 text-center text-[11px] text-muted-foreground">
                        Generating link…
                      </p>
                    )}
                  </motion.div>
                )}

                {menuView === "share" && inlineShare && (
                  <motion.div
                    key="menu-share"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="p-3"
                  >
                    <BackButton onClick={() => setMenuView("main")} />
                    <div className="px-1 pb-1 text-right text-[14px] font-semibold text-foreground">
                      Share chat
                    </div>
                    <p className="px-1 pb-2 text-right text-[11px] text-muted-foreground">
                      Future messages aren't included
                    </p>
                    <div className="rounded-xl border border-foreground/10 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => inlineShare.onModeChange("private")}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 ${inlineShare.mode === "private" ? "bg-foreground/[0.10]" : "active:bg-foreground/[0.06]"}`}
                      >
                        <Lock className="w-3.5 h-3.5 text-foreground shrink-0" />
                        <div className="text-right flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold text-foreground">
                            Keep private
                          </p>
                          <p className="text-[10.5px] text-muted-foreground">
                            Only you have access
                          </p>
                        </div>
                      </button>
                      <div className="h-px bg-foreground/10" />
                      <button
                        type="button"
                        onClick={() => inlineShare.onModeChange("public")}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 ${inlineShare.mode === "public" ? "bg-foreground/[0.10]" : "active:bg-foreground/[0.06]"}`}
                      >
                        <Globe className="w-3.5 h-3.5 text-foreground shrink-0" />
                        <div className="text-right flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold text-foreground">
                            Create public link
                          </p>
                          <p className="text-[10.5px] text-muted-foreground">
                            Anyone with the link can view
                          </p>
                        </div>
                      </button>
                    </div>
                    {inlineShare.mode === "public" && (
                      <div className="mt-3">
                        {inlineShare.url ? (
                          <button
                            type="button"
                            onClick={inlineShare.onCopyLink}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-foreground/[0.06] active:bg-foreground/[0.10]"
      aria-label="Copy"
    >
                            <span className="text-[11px] text-foreground truncate" dir="ltr">
                              {inlineShare.url}
                            </span>
                            <Copy className="w-3.5 h-3.5 text-foreground shrink-0" />
                          </button>
                        ) : (
                          <p className="text-center text-[11px] text-muted-foreground py-1">
                            Generating link…
                          </p>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {menuView === "delete" && (
                  <motion.div
                    key="menu-delete"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="p-3"
                  >
                    <BackButton onClick={() => setMenuView("main")} disabled={isDeleting} />
                    <div className="px-1 pb-3 text-right">
                      <div className="text-[14px] font-semibold text-foreground">Delete chat?</div>
                      <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
                        This conversation will be permanently removed.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMenuView("main")}
                        disabled={isDeleting}
                        className="flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-muted-foreground transition-colors active:bg-foreground/[0.08] disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmDelete}
                        disabled={isDeleting}
                        className="flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold bg-destructive text-foreground transition-opacity active:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Delete
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-2 flex items-center gap-1 text-[12px] font-medium text-muted-foreground active:text-foreground disabled:opacity-50"
    >
      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
      Back
    </button>
  );
}
