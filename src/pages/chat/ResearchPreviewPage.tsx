/** @doc Full-screen preview of a deep-research report. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  detectResearchReportDirection,
  normalizeResearchReport,
} from "@/lib/normalizeResearchReport";
import { toast } from "sonner";
import { goBackOr } from "@/lib/navigation";
import { ReportData, extractSources, ScrollProgress } from "@/components/research/templateUtils";
import ResearchArticleTemplate from "@/components/research/ResearchLandingTemplate";
import ResearchSources from "@/components/research/ResearchReportTabs";

const ResearchPreviewPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string; token?: string }>();
  const id = params.id;
  const shareToken = params.token;
  const isShareView = !!shareToken;
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const stateReport =
    (location.state as { reportData?: ReportData; autoDownload?: boolean } | null)?.reportData ??
    null;
  const autoDownload = (location.state as { autoDownload?: boolean } | null)?.autoDownload === true;
  const autoDownloadRef = useRef(false);
  const handleDownloadRef = useRef<() => void>(() => {});

  const cacheKey = id ? `research-preview:${id}` : shareToken ? `research-share:${shareToken}` : "";
  const openConversationInChat = (conversationId: string) => {
    navigate("/chat", { replace: true, state: { loadConversationId: conversationId } });
  };

  useEffect(() => {
    // Public share view: load by share_token (no auth required).
    if (isShareView && shareToken) {
      (async () => {
        const { data: row } = await supabase
          .from("research_reports")
          .select("query, report, images")
          .eq("share_token", shareToken)
          .maybeSingle();
        if (row) {
          setData({
            query: row.query,
            report: row.report,
            images: (row.images as any) || [],
          });
        }
        setLoading(false);
      })();
      return;
    }

    // 1) Hydrate from navigation state (first visit from chat).
    if (stateReport?.report) {
      const fresh = {
        query: stateReport.query,
        report: stateReport.report,
        images: Array.isArray(stateReport.images) ? stateReport.images : [],
      };
      setData(fresh);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(fresh));
      } catch {}
      setLoading(false);
      return;
    }
    // 2) Hydrate from sessionStorage so back-nav doesn't lose images.
    if (cacheKey) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as ReportData;
          if (parsed?.report) {
            setData(parsed);
            setLoading(false);
            return;
          }
        }
      } catch {}
    }
    if (!id) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      const uid = user.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }

      // Parse URL id: may be "<uuid>" or "conv_<uuid>_<idx>".
      const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const uuidMatch = id.match(uuidRe);
      const conversationId = uuidMatch ? uuidMatch[0] : null;
      if (conversationId && id === conversationId) {
        openConversationInChat(conversationId);
        return;
      }

      // 1) Direct session_key match (URL id used as-is).
      let { data: row } = await supabase
        .from("research_reports")
        .select("query, report, images")
        .eq("user_id", uid)
        .eq("session_key", id)
        .maybeSingle();

      // 2) Newest report saved against this conversation (any index).
      if (!row && conversationId) {
        const { data: rows } = await supabase
          .from("research_reports")
          .select("query, report, images, created_at")
          .eq("user_id", uid)
          .like("session_key", `conv_${conversationId}_%`)
          .order("created_at", { ascending: false })
          .limit(1);
        row = rows?.[0] ?? null;
      }

      if (row) {
        const fresh = {
          query: row.query,
          report: row.report,
          images: (row.images as any) || [],
        };
        setData(fresh);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(fresh));
        } catch {}
        setLoading(false);
        return;
      }

      // 3) Fallback: reconstruct from messages of the conversation.
      if (conversationId) {
        const { data: convo } = await supabase
          .from("conversations")
          .select("id, title, mode")
          .eq("id", conversationId)
          .eq("user_id", uid)
          .maybeSingle();
        if (convo) {
          const { data: msgs } = await supabase
            .from("messages")
            .select("role, content, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true });
          const userMsg = msgs?.find((m) => m.role === "user");
          const assistantMsg = [...(msgs || [])].reverse().find((m) => m.role === "assistant");
          if (assistantMsg?.content) {
            const fresh = {
              query: convo.title || userMsg?.content || "Research",
              report: assistantMsg.content,
              images: [] as string[],
            };
            setData(fresh);
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify(fresh));
            } catch {}
          }
        }
      }
      setLoading(false);
    })();
  }, [id, shareToken, stateReport]);

  const cleanReport = useMemo(() => (data ? normalizeResearchReport(data.report) : ""), [data]);
  const isRtl = cleanReport ? detectResearchReportDirection(cleanReport) === "rtl" : false;
  // Sources come from the RAW report: the normalizer strips the trailing
  // sources section from the body, but the full cited list feeds the
  // sources button below the report.
  const sourceItems = useMemo(() => extractSources(data?.report ?? ""), [data]);
  const reportEmpty = cleanReport.trim().length < 10;

  // Auto-trigger PDF download when navigated with autoDownload flag.
  useEffect(() => {
    if (!autoDownload || !data || autoDownloadRef.current) return;
    autoDownloadRef.current = true;
    const timer = setTimeout(() => {
      handleDownloadRef.current();
    }, 700);
    return () => clearTimeout(timer);
  }, [autoDownload, data]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Report not found.</p>
      </div>
    );
  }

  const handleDownload = async () => {
    if (!reportRef.current || exporting) return;
    setExporting(true);
    const t = toast.loading("Generating PDF…");
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const node = reportRef.current;
      // Match the live theme background instead of a hardcoded color.
      let bg = getComputedStyle(node).backgroundColor;
      if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
        bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      }

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;
      const gap = 4;

      // Capture each logical section separately so text never gets cut mid-line.
      const sectionEls = Array.from(
        node.querySelectorAll<HTMLElement>("[data-report-section]"),
      ).filter((el) => el.offsetHeight > 20);
      const targets: HTMLElement[] = sectionEls.length > 0 ? sectionEls : [node];

      let cursorY = margin;
      let firstPage = true;

      for (const el of targets) {
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: bg,
          logging: false,
          windowWidth: el.scrollWidth,
        });
        const pxPerMm = canvas.width / usableW;
        const fullHmm = canvas.height / pxPerMm;

        // Section fits on the rest of the current page → place as-is
        if (fullHmm <= pageH - margin - cursorY) {
          const imgData = canvas.toDataURL("image/png");
          pdf.addImage(imgData, "PNG", margin, cursorY, usableW, fullHmm, undefined, "FAST");
          cursorY += fullHmm + gap;
          firstPage = false;
          continue;
        }

        // Section taller than remaining space — start a new page and slice.
        if (cursorY > margin) {
          pdf.addPage();
          cursorY = margin;
        }
        let rendered = 0;
        const sliceH = Math.floor(usableH * pxPerMm);
        while (rendered < canvas.height) {
          const cur = Math.min(sliceH, canvas.height - rendered);
          const sc = document.createElement("canvas");
          sc.width = canvas.width;
          sc.height = cur;
          const ctx = sc.getContext("2d");
          if (!ctx) break;
          ctx.drawImage(canvas, 0, rendered, canvas.width, cur, 0, 0, canvas.width, cur);
          const imgData = sc.toDataURL("image/png");
          const imgHmm = cur / pxPerMm;
          if (rendered > 0) {
            pdf.addPage();
            cursorY = margin;
          }
          pdf.addImage(imgData, "PNG", margin, cursorY, usableW, imgHmm, undefined, "FAST");
          cursorY += imgHmm + gap;
          rendered += cur;
        }
        firstPage = false;
        // Force next section to start fresh page if very little room left
        if (pageH - margin - cursorY < 30) {
          pdf.addPage();
          cursorY = margin;
        }
      }

      const safe =
        data.query
          .slice(0, 60)
          .replace(/[\\/:*?"<>|]/g, "-")
          .trim() || "research";
      pdf.save(`${safe}.pdf`);
      toast.success("Downloaded", { id: t });
    } catch (e) {
      console.error("[pdf]", e);
      toast.error("Failed to generate PDF", { id: t });
    } finally {
      setExporting(false);
    }
  };

  // assign the latest download fn to the ref so the auto-download effect can call it
  handleDownloadRef.current = handleDownload;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground" dir="ltr">
      <ScrollProgress />

      {createPortal(<Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => {
          const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
          const convId = id?.match(uuidRe)?.[0];
          if (convId) {
            openConversationInChat(convId);
          } else {
            goBackOr(navigate, "/chat");
          }
        }}
        className={`fixed top-[max(env(safe-area-inset-top),1rem)] z-[9999] h-11 w-11 rounded-full border-border/70 bg-background/75 text-foreground shadow-lg backdrop-blur-2xl hover:bg-background ${
          isRtl ? "right-4" : "left-4"
        }`}
        aria-label={isRtl ? "رجوع" : "Back to conversation"}
        title={isRtl ? "رجوع" : "Back"}
      >
        <ArrowLeft className={`h-5 w-5 ${isRtl ? "rotate-180" : ""}`} />
      </Button>, document.body)}

      <div ref={reportRef} className="animate-fade-in bg-background">
        <ResearchArticleTemplate
          data={data}
          cleanReport={cleanReport}
          isRtl={isRtl}
          reportEmpty={reportEmpty}
        />
      </div>

      {!reportEmpty && <ResearchSources reportSources={sourceItems} isRtl={isRtl} />}
    </div>
  );
};

export default ResearchPreviewPage;
