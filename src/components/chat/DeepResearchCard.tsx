import { useNavigate } from "react-router-dom";
import { FileText, ExternalLink } from "lucide-react";
import {
  detectResearchReportDirection,
  normalizeResearchReport,
} from "@/lib/normalizeResearchReport";
import ToolCard from "./primitives/ToolCard";

interface DeepResearchCardProps {
  query: string;
  report: string;
  images?: string[];
  sessionKey?: string;
  createdAt?: string;
}

const DeepResearchCard = ({
  query,
  report,
  images = [],
  sessionKey,
}: DeepResearchCardProps) => {
  const navigate = useNavigate();
  const cleanReport = normalizeResearchReport(report);
  const isRtl = detectResearchReportDirection(cleanReport) === "rtl";
  const isEmpty = !cleanReport?.trim();

  const openPreview = () => {
    const target = sessionKey ? `/research/preview/${sessionKey}` : "/research/preview/new";
    // Keep the raw report here. The preview normalizes only the article body,
    // while its sources drawer still needs the original citation links.
    navigate(target, { state: { reportData: { query, report, images } } });
  };

  return (
    <ToolCard
      dir={"ltr"}
      className="max-w-[420px]"
      icon={<FileText className="h-4 w-4" />}
      title={query}
      subtitle={isEmpty ? "No report content" : undefined}
    >
      <div className={"text-left"}>
        <button
          type="button"
          onClick={openPreview}
          disabled={isEmpty}
          className="inline-flex items-center gap-1.5 justify-center px-5 h-9 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </button>
      </div>
    </ToolCard>
  );
};

export default DeepResearchCard;
