import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  LayoutGrid,
  Sparkles,
  Settings,
  User,
  CreditCard,
  Shield,
  KeyRound,
  Plug,
  Star,
  Compass,
  FileText,
  LogOut,
  Palette,
  Clock,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

type RecentConv = { id: string; title: string; updated_at: string };


type Cmd = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  run: () => void;
};


export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentConv[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("megsy:open-palette", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("megsy:open-palette", onOpen as EventListener);
    };
  }, []);

  // Fetch recent conversations when the palette opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from("conversations")
          .select("id, title, updated_at")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .limit(8);
        if (!cancelled && data) {
          setRecent(
            data.map((c: any) => ({
              id: c.id,
              title: c.title || "Untitled",
              updated_at: c.updated_at,
            })),
          );
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const go = (to: string) => () => {
    setOpen(false);
    navigate(to);
  };

  const openConv = (id: string) => () => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("megsy:open-conversation", { detail: { id } }),
    );
    navigate("/");
  };


  // Light theme removed — app is dark-only, so no theme toggle.


  const nav: Cmd[] = [
    { id: "chat", label: "New Chat", icon: MessageSquare, hint: "/", run: go("/") },
    { id: "apps", label: "Apps", icon: LayoutGrid, run: go("/apps") },
    { id: "models", label: "AI Models", icon: Sparkles, run: go("/models") },
    { id: "showcase", label: "Showcase", icon: Star, run: go("/showcase") },
    { id: "pricing", label: "Pricing", icon: CreditCard, run: go("/pricing") },
    { id: "about", label: "About", icon: Compass, run: go("/about") },
  ];

  const settings: Cmd[] = [
    { id: "s", label: "Settings", icon: Settings, run: go("/settings") },
    { id: "s-profile", label: "Profile", icon: User, run: go("/settings/profile") },
    { id: "s-cust", label: "Composer", icon: Palette, run: go("/settings/customization") },
    { id: "s-ai", label: "AI Personalization", icon: Sparkles, run: go("/settings/ai-personalization") },
    { id: "s-mcp", label: "MCP Servers", icon: Plug, keywords: "tools integrations", run: go("/settings/mcp") },
    { id: "s-bill", label: "Billing", icon: CreditCard, run: go("/settings/billing") },
    { id: "s-sec", label: "Security", icon: Shield, run: go("/settings/security") },
    { id: "s-help", label: "Help", icon: FileText, run: go("/settings/help") },
  ];

  const actions: Cmd[] = [

    {
      id: "signout",
      label: "Sign out",
      icon: LogOut,
      run: () => {
        setOpen(false);
        navigate("/auth?signout=1");
      },
    },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {nav.map((c) => (
            <CommandItem key={c.id} value={`${c.label} ${c.keywords ?? ""}`} onSelect={c.run}>
              <c.icon className="mr-2 h-4 w-4" />
              <span>{c.label}</span>
              {c.hint ? (
                <span className="ml-auto text-xs text-muted-foreground">{c.hint}</span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
        {recent.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Conversations">
              {recent.map((c) => (
                <CommandItem
                  key={`r-${c.id}`}
                  value={`recent ${c.title}`}
                  onSelect={openConv(c.id)}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  <span className="truncate">{c.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Settings">
          {settings.map((c) => (
            <CommandItem key={c.id} value={`${c.label} ${c.keywords ?? ""}`} onSelect={c.run}>
              <c.icon className="mr-2 h-4 w-4" />
              <span>{c.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {actions.map((c) => (
            <CommandItem key={c.id} value={c.label} onSelect={c.run}>
              <c.icon className="mr-2 h-4 w-4" />
              <span>{c.label}</span>
              {c.hint ? (
                <span className="ml-auto text-xs text-muted-foreground">{c.hint}</span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
