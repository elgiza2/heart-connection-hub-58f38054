import { memo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Image as ImageIcon,
  Video,
  Film,
  Mic,
  GalleryHorizontal,
  type LucideIcon,
} from "lucide-react";

type Item = { label: string; path: string; Icon: LucideIcon };
type Group = { label: string; items: Item[] };

const mediaGroups: Group[] = [];

interface Props {
  mode: string;
  onNavigate?: () => void;
  size?: "sm" | "md";
}

const SidebarSubNav = ({ mode, onNavigate, size = "sm" }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();

  const groups = mode === "images" || mode === "videos" ? mediaGroups : null;
  if (!groups || groups.length === 0) return null;

  const rowH = size === "md" ? "h-11" : "h-9";
  const rowText = size === "md" ? "text-[14.5px]" : "text-[13px]";
  const iconCls = size === "md" ? "w-[18px] h-[18px]" : "w-4 h-4";

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-3 pt-2 pb-1 font-display text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
            {g.label}
          </div>
          <ul className="space-y-0.5">
            {g.items.map(({ label, path, Icon }) => {
              const active = location.pathname === path;
              return (
                <li key={label}>
                  <button
                    onClick={() => {
                      navigate(path);
                      onNavigate?.();
                    }}
                    className={`w-full ${rowH} px-3 flex items-center gap-2.5 rounded-lg transition-colors ${
                      active
                        ? "bg-foreground/10 text-foreground"
                        : "text-foreground/80 hover:text-foreground hover:bg-foreground/[0.05]"
                    }`}
                  >
                    <Icon className={`${iconCls} opacity-80`} strokeWidth={1.7} />
                    <span className={`${rowText} font-medium truncate`}>{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default memo(SidebarSubNav);
