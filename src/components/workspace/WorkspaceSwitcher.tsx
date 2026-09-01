// Workspace switcher — neo-brutalist sticker card, Arabic labels.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Users, Settings2, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWorkspaces } from "@/hooks/useWorkspace";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { toast } from "sonner";

interface Props {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

// Cartoon palette (matches mobile settings sticker cards).
const INK = "hsl(var(--brand-ink))";
const PAGE_BG = "hsl(var(--brand-ink))";
const SURFACE = "hsl(var(--surface-1))";
const SURFACE_2 = "hsl(var(--surface-3))";
const BORDER = "hsl(var(--surface-4))";
const TEXT = "hsl(var(--brand-parchment))";
const MUTED = "hsl(var(--brand-muted))";
const YELLOW = "hsl(var(--brand-action))";
const LAVENDER = "#C4B5FD";
const MINT = "hsl(var(--brand-mint))";

export default function WorkspaceSwitcher({ children, align = "start", side = "top" }: Props) {
  const navigate = useNavigate();
  const { workspaces, activeId, setActive, loading } = useWorkspaces();
  const account = useActiveAccount();
  const [open, setOpen] = useState(false);

  const switchTo = async (id: string | null, name: string) => {
    await setActive(id);
    toast.success(`Switched to ${name}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className="w-[280px] p-0 border-0 rounded-[22px] shadow-none bg-transparent"
        style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
      >
        <div
          className="overflow-hidden rounded-[22px]"
          style={{
            backgroundColor: SURFACE,
            border: `2.5px solid ${INK}`,
            boxShadow: `4px 4px 0 ${INK}`,
          }}
        >
          {/* Active identity header */}
          <div
            className="px-4 py-3 flex items-center justify-between gap-3"
            style={{ borderBottom: `2.5px solid ${INK}`, backgroundColor: YELLOW }}
          >
            <div className="min-w-0">
              <p
                className="text-[10px] font-extrabold uppercase tracking-[0.18em]"
                style={{ color: INK, opacity: 0.8 }}
              >
                Active account
              </p>
              <p
                className="text-[14px] font-extrabold truncate tracking-tight"
                style={{ color: INK }}
              >
                {account.name}
              </p>
            </div>
            <p
              className="text-[12px] tabular-nums shrink-0 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: INK, color: YELLOW, fontWeight: 800 }}
            >
              {account.credits.toFixed(0)}
              <span className="mr-1 opacity-80">cr</span>
            </p>
          </div>

          {/* Workspaces list */}
          <div className="max-h-72 overflow-y-auto py-1">
            <button
              onClick={() => switchTo(null, "Personal")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition active:translate-x-[1px] active:translate-y-[1px]"
              style={{ color: TEXT }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = SURFACE_2)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <div
                className="w-8 h-8 rounded-xl grid place-items-center text-[12px] font-extrabold shrink-0"
                style={{ backgroundColor: LAVENDER, color: INK, border: `2px solid ${INK}` }}
              >
                P
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-extrabold truncate" style={{ color: TEXT }}>
                  Personal
                </p>
                <p className="text-[11px] font-bold" style={{ color: MUTED }}>
                  Your personal space
                </p>
              </div>
              {activeId === null && (
                <Check className="w-4 h-4 shrink-0" style={{ color: MINT }} strokeWidth={3} />
              )}
            </button>

            {loading ? (
              <p className="px-4 py-2 text-[11px] font-bold" style={{ color: MUTED }}>
                Loading…
              </p>
            ) : (
              workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => switchTo(w.id, w.name)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition active:translate-x-[1px] active:translate-y-[1px]"
                  style={{ color: TEXT }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = SURFACE_2)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {w.avatar_url ? (
                    <img loading="lazy" decoding="async"
                      src={w.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-xl object-cover shrink-0"
                      style={{ border: `2px solid ${INK}` }}
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-xl grid place-items-center text-[12px] font-extrabold shrink-0"
                      style={{ backgroundColor: TEXT, color: INK, border: `2px solid ${INK}` }}
                    >
                      {w.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-extrabold truncate" style={{ color: TEXT }}>
                      {w.name}
                    </p>
                    <p className="text-[11px] font-bold tabular-nums" style={{ color: MUTED }}>
                      {Number(w.credits).toFixed(0)} cr
                    </p>
                  </div>
                  {activeId === w.id && (
                    <Check className="w-4 h-4 shrink-0" style={{ color: MINT }} strokeWidth={3} />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Actions */}
          <div
            className="py-1"
            style={{ borderTop: `2.5px solid ${INK}`, backgroundColor: PAGE_BG }}
          >
            {activeId && (
              <button
                onClick={() => {
                  setOpen(false);
                  navigate(`/settings/workspaces/${activeId}`);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-left transition active:translate-x-[1px] active:translate-y-[1px]"
                style={{ color: TEXT }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = SURFACE_2)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <Settings2
                  className="w-4 h-4 shrink-0"
                  style={{ color: MUTED }}
                  strokeWidth={2.5}
                />
                Manage current workspace
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                navigate("/settings/workspaces");
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-left transition active:translate-x-[1px] active:translate-y-[1px]"
              style={{ color: TEXT }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = SURFACE_2)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Users className="w-4 h-4 shrink-0" style={{ color: MUTED }} strokeWidth={2.5} />
              All workspaces
            </button>
            <button
              onClick={() => {
                setOpen(false);
                navigate("/settings/workspaces/new");
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-left transition active:translate-x-[1px] active:translate-y-[1px]"
              style={{ color: TEXT }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = SURFACE_2)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Plus className="w-4 h-4 shrink-0" style={{ color: MUTED }} strokeWidth={2.5} />
              New workspace
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
