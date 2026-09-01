/** @doc Data controls detail — lists and deletes one category of user-stored content.
 * Never exposes raw storage URLs in the UI: items render real previews (image
 * thumbnails, video posters, file-type icons, site favicons) and open through
 * an in-app viewer instead of linking out to storage hosts. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2,
  Trash2,
  Eye,
  Download,
  Play,
  X,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  FileCode2,
  File as FileIcon,
  Globe,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserLang } from "@/lib/authI18n";
import { SubShell, SubCard } from "@/components/settings/SubShell";
import { cn } from "@/lib/utils";

type Kind = "image" | "video" | "file" | "site" | "shared";

type Item = {
  id: string;
  title: string;
  sub?: string;
  url?: string | null;
  filename?: string;
  mime?: string | null;
  domain?: string | null;
  created_at?: string;
};

type Cfg = {
  table: string;
  kind: Kind;
  titleAr: string;
  titleEn: string;
  emptyAr: string;
  emptyEn: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  select: string;
  filter?: (b: any) => any;
  map: (r: any) => Item;
};

const CONFIGS: Record<string, Cfg> = {
  images: {
    table: "media_assets",
    kind: "image",
    titleAr: "Images",
    titleEn: "Images",
    emptyAr: "No images yet",
    emptyEn: "No images yet",
    icon: ImageIcon,
    select: "id, prompt, model, public_url, created_at",
    filter: (b) => b.eq("kind", "image"),
    map: (r) => ({ id: r.id, title: r.prompt || "Image", sub: r.model, url: r.public_url, created_at: r.created_at }),
  },
  videos: {
    table: "media_assets",
    kind: "video",
    titleAr: "Videos",
    titleEn: "Videos",
    emptyAr: "No videos yet",
    emptyEn: "No videos yet",
    icon: VideoIcon,
    select: "id, prompt, model, public_url, duration_seconds, created_at",
    filter: (b) => b.eq("kind", "video"),
    map: (r) => ({
      id: r.id,
      title: r.prompt || "Video",
      sub: [r.model, r.duration_seconds ? `${r.duration_seconds}s` : null].filter(Boolean).join(" · "),
      url: r.public_url,
      created_at: r.created_at,
    }),
  },
  files: {
    table: "user_assets",
    kind: "file",
    titleAr: "Files",
    titleEn: "Files",
    emptyAr: "No files yet",
    emptyEn: "No files yet",
    icon: FileText,
    select: "id, original_filename, mime_type, size_bytes, public_url, created_at",
    map: (r) => ({
      id: r.id,
      title: r.original_filename || "File",
      sub: r.size_bytes ? `${Math.max(1, Math.round(r.size_bytes / 1024))} KB` : undefined,
      url: r.public_url,
      filename: r.original_filename || undefined,
      mime: r.mime_type,
      created_at: r.created_at,
    }),
  },
  sites: {
    table: "generated_sites",
    kind: "site",
    titleAr: "Published sites",
    titleEn: "Published sites",
    emptyAr: "No published sites",
    emptyEn: "No published sites",
    icon: Globe,
    select: "id, title, status, published_url, preview_url, share_slug, created_at",
    map: (r) => {
      const url = r.published_url || r.preview_url || (r.share_slug ? `/s/${r.share_slug}` : null);
      let domain: string | null = null;
      try {
        domain = url ? new URL(url, window.location.origin).hostname : null;
      } catch {
        domain = null;
      }
      return {
        id: r.id,
        title: r.title || "Untitled site",
        sub: r.status,
        url,
        domain,
        created_at: r.created_at,
      };
    },
  },
  shared: {
    table: "conversations",
    kind: "shared",
    titleAr: "Shared chats",
    titleEn: "Shared chats",
    emptyAr: "No shared chats",
    emptyEn: "No shared chats",
    icon: Share2,
    select: "id, title, share_id, created_at",
    filter: (b) => b.eq("is_shared", true),
    map: (r) => ({
      id: r.id,
      title: r.title || "Untitled chat",
      url: r.share_id ? `/share/${r.share_id}` : null,
      created_at: r.created_at,
    }),
  },
};

function slugify(s: string) {
  return (s || "file").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60) || "file";
}

function extFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const path = new URL(url).pathname;
    const ext = path.split(".").pop();
    return ext && ext.length <= 5 ? ext : null;
  } catch {
    return null;
  }
}

function fileIconFor(mime?: string | null, filename?: string): React.ComponentType<{ className?: string; strokeWidth?: number }> {
  const ext = (filename || "").split(".").pop()?.toLowerCase();
  if (mime?.startsWith("image/")) return ImageIcon;
  if (mime?.startsWith("video/")) return VideoIcon;
  if (mime?.startsWith("audio/")) return FileAudio;
  if (mime === "application/pdf") return FileText;
  if (ext && ["zip", "rar", "7z", "tar", "gz"].includes(ext)) return FileArchive;
  if (ext && ["xls", "xlsx", "csv"].includes(ext)) return FileSpreadsheet;
  if (ext && ["js", "ts", "tsx", "jsx", "py", "html", "css", "json"].includes(ext)) return FileCode2;
  return FileIcon;
}

async function downloadAsset(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
  } catch (e) {
    toast.error("Could not download file");
  }
}

// ============================================================================
// In-app preview modal — replaces "open raw URL in a new tab" with a real
// viewer so users never see storage URLs.
// ============================================================================
function PreviewModal({ item, kind, onClose }: { item: Item; kind: Kind; onClose: () => void }) {
  const isPdf = item.mime === "application/pdf";
  const isImageFile = item.mime?.startsWith("image/");
  const isVideoFile = item.mime?.startsWith("video/");
  const Icon = fileIconFor(item.mime, item.filename);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 p-2 rounded-full bg-foreground/10 text-white hover:bg-foreground/20"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="max-w-3xl w-full max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {kind === "image" || isImageFile ? (
          <img src={item.url || ""} alt={item.title} className="max-h-[85vh] w-auto max-w-full rounded-lg object-contain" />
        ) : kind === "video" || isVideoFile ? (
          <video src={item.url || ""} controls autoPlay className="max-h-[85vh] w-full rounded-lg bg-black" />
        ) : kind === "file" && isPdf ? (
          <iframe title={item.title} src={item.url || ""} className="w-full h-[85vh] rounded-lg bg-white" />
        ) : kind === "site" ? (
          <div className="w-full h-[85vh] rounded-lg overflow-hidden bg-white">
            <iframe title={item.title} src={item.url || ""} className="w-full h-full border-0" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 bg-[var(--mn-card)] rounded-2xl px-10 py-12">
            <Icon className="w-12 h-12 text-[color:var(--mn-muted)]" strokeWidth={1.3} />
            <p className="text-[13.5px] font-medium text-[color:var(--mn-fg)] text-center max-w-xs truncate">{item.title}</p>
            {item.url && (
              <button
                type="button"
                onClick={() => downloadAsset(item.url as string, item.filename || slugify(item.title))}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[color:var(--mn-press)] text-[12.5px] font-medium text-[color:var(--mn-fg)]"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DataCategoryPage() {
  const { category = "" } = useParams();
  const navigate = useNavigate();
  const lang = useUserLang();
  const isAr = lang === "ar-eg";
  const cfg = CONFIGS[category];
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [preview, setPreview] = useState<Item | null>(null);

  const load = useCallback(async () => {
    if (!cfg) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    let query: any = supabase.from(cfg.table as any).select(cfg.select).eq("user_id", uid);
    if (cfg.filter) query = cfg.filter(query);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
    if (error) toast.error(error.message);
    setItems(((data as any[]) || []).map(cfg.map));
    setLoading(false);
  }, [cfg]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!cfg) return;
    setBusy(id);
    if (cfg.table === "conversations") {
      const { error } = await supabase.from("conversations").update({ is_shared: false }).eq("id", id);
      if (error) toast.error(error.message);
      else setItems((p) => p.filter((i) => i.id !== id));
    } else {
      const { error } = await supabase.from(cfg.table as any).delete().eq("id", id);
      if (error) toast.error(error.message);
      else setItems((p) => p.filter((i) => i.id !== id));
    }
    setBusy(null);
  };

  const handleDownload = async (it: Item) => {
    if (!it.url) return;
    setDownloading(it.id);
    const filename =
      it.filename ||
      `${slugify(it.title)}.${extFromUrl(it.url) || (cfg?.kind === "video" ? "mp4" : "png")}`;
    await downloadAsset(it.url, filename);
    setDownloading(null);
  };

  const handleView = (it: Item) => {
    if (!cfg) return;
    if (cfg.kind === "shared") {
      if (it.url) navigate(it.url);
      return;
    }
    if (!it.url) return;
    setPreview(it);
  };

  if (!cfg) {
    return (
      <SubShell title={"Data controls"} backTo="/settings/data">
        <SubCard>
          <p className="text-[13px] text-[color:var(--mn-muted)]">{"Unknown section"}</p>
        </SubCard>
      </SubShell>
    );
  }

  const Icon = cfg.icon;
  const isGrid = cfg.kind === "image" || cfg.kind === "video";

  return (
    <SubShell title={isAr ? cfg.titleAr : cfg.titleEn} backTo="/settings/data">
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-[color:var(--mn-muted)]" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Icon className="w-9 h-9 text-[color:var(--mn-faint)]" strokeWidth={1.4} />
          <p className="text-[13px] text-[color:var(--mn-muted)]">{isAr ? cfg.emptyAr : cfg.emptyEn}</p>
        </div>
      ) : isGrid ? (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((it) => (
            <GridTile
              key={it.id}
              item={it}
              kind={cfg.kind}
              busy={busy === it.id}
              downloading={downloading === it.id}
              onView={() => handleView(it)}
              onDownload={() => handleDownload(it)}
              onDelete={() => remove(it.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[14px] overflow-hidden bg-[var(--mn-card)] divide-y divide-[color:var(--mn-sep)]">
          {items.map((it) => (
            <ListRow
              key={it.id}
              item={it}
              kind={cfg.kind}
              icon={Icon}
              busy={busy === it.id}
              downloading={downloading === it.id}
              onView={() => handleView(it)}
              onDownload={() => handleDownload(it)}
              onDelete={() => remove(it.id)}
            />
          ))}
        </div>
      )}

      {preview && <PreviewModal item={preview} kind={cfg.kind} onClose={() => setPreview(null)} />}
    </SubShell>
  );
}

// ============================================================================
// GridTile — thumbnail cell for images/videos.
// ============================================================================
function GridTile({
  item,
  kind,
  busy,
  downloading,
  onView,
  onDownload,
  onDelete,
}: {
  item: Item;
  kind: Kind;
  busy: boolean;
  downloading: boolean;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative aspect-square rounded-[10px] overflow-hidden bg-[color:var(--mn-press)] group">
      <button type="button" onClick={onView} className="absolute inset-0 w-full h-full" aria-label="View">
        {kind === "image" ? (
          <img src={item.url || ""} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <>
            <video src={item.url || ""} muted preload="metadata" playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/15">
              <div className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="w-4 h-4 text-white fill-white" strokeWidth={0} />
              </div>
            </div>
          </>
        )}
      </button>
      <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          aria-label="Download"
          className="p-1.5 rounded-full bg-black/55 text-white hover:bg-black/70 disabled:opacity-50"
        >
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete"
          className="p-1.5 rounded-full bg-black/55 text-white hover:bg-red-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ListRow — row for files / sites / shared chats.
// ============================================================================
function ListRow({
  item,
  kind,
  icon: FallbackIcon,
  busy,
  downloading,
  onView,
  onDownload,
  onDelete,
}: {
  item: Item;
  kind: Kind;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  busy: boolean;
  downloading: boolean;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const TypeIcon = kind === "file" ? fileIconFor(item.mime, item.filename) : FallbackIcon;
  const favicon = kind === "site" && item.domain ? `https://www.google.com/s2/favicons?domain=${item.domain}&sz=64` : null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {favicon ? (
        <img src={favicon} alt="" className="w-8 h-8 rounded-[7px] shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-[7px] bg-[color:var(--mn-press)] flex items-center justify-center shrink-0">
          <TypeIcon className="w-4 h-4 text-[color:var(--mn-muted)]" strokeWidth={1.6} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium text-[color:var(--mn-fg)] truncate">{item.title}</p>
        {(item.sub || item.created_at) && (
          <p className="text-[11.5px] text-[color:var(--mn-muted)] truncate">
            {[item.sub, item.created_at ? new Date(item.created_at).toLocaleDateString() : null].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {item.url && (
        <button
          type="button"
          onClick={onView}
          aria-label="View"
          className="p-2 text-[color:var(--mn-muted)] hover:text-[color:var(--mn-fg)]"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}
      {kind === "file" && item.url && (
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          aria-label="Download"
          className="p-2 text-[color:var(--mn-muted)] hover:text-[color:var(--mn-fg)] disabled:opacity-50"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label="Delete"
        className={cn("p-2 text-[color:var(--mn-danger)] disabled:opacity-50")}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );
}
