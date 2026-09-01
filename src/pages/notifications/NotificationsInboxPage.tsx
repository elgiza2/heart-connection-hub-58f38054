/** @doc Notifications inbox — grouped feed with All / Updates / Messages tabs. */
import EmptyState from "@/components/common/EmptyState";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { goBackOr } from "@/lib/navigation";

type Row = {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type UpdateRow = {
  id: string;
  title: string;
  description: string | null;
  media_url: string | null;
  media_type: string;
  published_at: string;
};

type TabKey = "all" | "updates" | "messages";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "updates", label: "Updates" },
  { key: "messages", label: "Messages" },
];

const MESSAGE_TYPES = new Set(["message", "chat", "reply", "mention", "support"]);

function dayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

type FeedItem = {
  id: string;
  kind: "update" | "message";
  title: string;
  body: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  at: string;
};

const NotificationsInboxPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const updatesReq = supabase
          .from("app_updates")
          .select("id,title,description,media_url,media_type,published_at")
          .eq("published", true)
          .order("published_at", { ascending: false })
          .limit(50);

        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;

        const [{ data: upd }, msgRes] = await Promise.all([
          updatesReq,
          uid
            ? supabase
                .from("notifications")
                .select("id,title,message,type,read,created_at,metadata")
                .eq("user_id", uid)
                .order("created_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [] as unknown[] }),
        ]);

        if (cancelled) return;
        setUpdates((upd as unknown as UpdateRow[]) ?? []);
        const data = (msgRes as { data: unknown[] | null }).data as Row[] | null;
        setRows(data ?? []);
        setLoading(false);
        const unread = (data ?? []).filter((r) => !r.read).map((r) => r.id);
        if (unread.length) {
          void supabase.from("notifications").update({ read: true }).in("id", unread);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateItems = useMemo<FeedItem[]>(
    () =>
      updates.map((u) => ({
        id: `u-${u.id}`,
        kind: "update" as const,
        title: u.title,
        body: u.description ?? "",
        mediaUrl: u.media_url,
        mediaType: u.media_type === "video" ? ("video" as const) : ("image" as const),
        at: u.published_at,
      })),
    [updates],
  );

  const messageItems = useMemo<FeedItem[]>(
    () =>
      rows
        .filter((r) => MESSAGE_TYPES.has(r.type))
        .map((r) => ({
          id: `n-${r.id}`,
          kind: "message" as const,
          title: r.title,
          body: r.message ?? "",
          mediaUrl: null,
          mediaType: null,
          at: r.created_at,
        })),
    [rows],
  );

  const filtered = useMemo(() => {
    const list =
      tab === "updates" ? updateItems : tab === "messages" ? messageItems : [...updateItems, ...messageItems];
    return list.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [tab, updateItems, messageItems]);

  const groups = useMemo(() => {
    const map = new Map<string, FeedItem[]>();
    for (const r of filtered) {
      const k = dayLabel(r.at);
      const arr = map.get(k);
      if (arr) arr.push(r);
      else map.set(k, [r]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="nti-root" dir="ltr">
      <style>{ntiCss}</style>

      <header className="nti-topbar">
        <button
          className="nti-icon-btn"
          aria-label="Back"
          onClick={() => goBackOr(navigate, "/settings")}
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2} />
        </button>
        <h1 className="nti-title">Notifications</h1>
        <div className="nti-icon-btn nti-icon-btn-ghost" />
      </header>

      <div className="nti-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`nti-tab ${tab === t.key ? "is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="nti-main">
        {loading ? (
          <div className="nti-state">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="nti-state nti-empty">
            <EmptyState
              compact
              title="You're all caught up"
              description="New updates and messages will appear here."
            />
          </div>
        ) : (
          groups.map(([day, items], gi) => (
            <section key={day} className="nti-group" style={{ animationDelay: `${gi * 40}ms` }}>
              <h2 className="nti-day">{day}</h2>
              {items.map((n) => (
                <article key={n.id} className="nti-card">
                  {n.mediaUrl && n.mediaType === "image" && (
                    <div className="nti-media">
                      <img src={n.mediaUrl} alt={n.title} loading="lazy" />
                    </div>
                  )}
                  {n.mediaUrl && n.mediaType === "video" && (
                    <div className="nti-media">
                      <video src={n.mediaUrl} controls playsInline preload="metadata" />
                    </div>
                  )}
                  <h3 className="nti-card-title">{n.title}</h3>
                  {n.body && <p className="nti-card-body">{n.body}</p>}
                </article>
              ))}
            </section>
          ))
        )}
        <div className="nti-spacer" />
      </main>
    </div>
  );
};

const ntiCss = `
.nti-root {
  min-height: 100dvh;
  background: var(--mn-bg);
  color: var(--mn-fg);
  font-family: "Neue Haas Unica", "Helvetica Now Display", -apple-system, "SF Pro Display", Inter, "Segoe UI", Roboto, sans-serif;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.nti-topbar {
  position: sticky; top: 0; z-index: 5;
  display: grid; grid-template-columns: 30px 1fr 30px;
  align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 6px) 12px 6px;
  background: var(--mn-bg);
}
.nti-title {
  margin: 0; text-align: center;
  font-size: 15px; font-weight: 600;
  letter-spacing: -0.01em; color: var(--mn-fg);
}
.nti-icon-btn {
  width: 30px; height: 30px;
  display: inline-grid; place-items: center;
  border-radius: 999px;
  background: transparent; border: 0;
  color: var(--mn-fg); cursor: pointer;
  transition: transform 160ms ease;
}
.nti-icon-btn:active { transform: scale(0.94); }
.nti-icon-btn-ghost { pointer-events: none; }

.nti-tabs {
  display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
  gap: 2px;
  margin: 2px 12px 6px;
  padding: 2px;
  background: var(--mn-seg);
  border-radius: 10px;
}
.nti-tab {
  padding: 5px 6px;
  border: 0; border-radius: 8px;
  background: transparent;
  color: var(--mn-muted);
  font: inherit; font-size: 12px; font-weight: 500;
  cursor: pointer;
  transition: background 180ms ease, color 180ms ease;
}
.nti-tab.is-active { background: var(--mn-seg-active); color: var(--mn-fg); }

.nti-main { padding: 2px 14px 20px; }
.nti-group { animation: nti-rise 320ms cubic-bezier(0.16,1,0.3,1) both; }
.nti-day {
  margin: 14px 4px 8px;
  font-size: 11.5px; font-weight: 500;
  color: var(--mn-muted);
}
.nti-card {
  background: var(--mn-card);
  border-radius: 14px;
  padding: 10px 12px 12px;
  margin-bottom: 10px;
}
.nti-media {
  border-radius: 10px; overflow: hidden;
  margin-bottom: 10px; background: var(--mn-bg);
  aspect-ratio: 16 / 10;
}
.nti-media img,
.nti-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
.nti-card-title {
  margin: 0 0 4px;
  font-size: 14px; font-weight: 600;
  color: var(--mn-fg); letter-spacing: -0.01em;
}
.nti-card-body {
  margin: 0;
  font-size: 12.5px; line-height: 1.5;
  color: var(--mn-muted);
}

.nti-state {
  display: grid; place-items: center;
  padding: 60px 16px;
  color: hsl(var(--foreground) / 0.6);
}
.nti-empty { gap: 5px; text-align: center; }
.nti-empty-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--mn-fg); }
.nti-empty-sub { margin: 0; font-size: 12.5px; color: hsl(var(--foreground) / 0.6); }

.nti-spacer { height: 28px; }

@keyframes nti-rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
`;

export default NotificationsInboxPage;
