/** @doc Full-screen file slides preview page — opens generated PPTX/PDF slide files as their own route. */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PptxPreviewScreen } from "@/components/chat/StandardSlidesCard";
import { readSlidesFileForPreview, type SlidesFilePreviewPayload } from "@/lib/slidesFilePreviewStore";

const SlidesFilePreviewPage = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<SlidesFilePreviewPayload | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const p = readSlidesFileForPreview(id);
    if (p) setPayload(p);
    else setNotFound(true);
  }, [id]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/chat");
  };

  if (notFound) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p className="text-sm opacity-80">Preview not available. Please regenerate the deck.</p>
        <button
          onClick={() => navigate("/chat")}
          data-slides-preview-button
          style={{ backgroundColor: "#ffffff", color: "#000000", WebkitTextFillColor: "#000000" }}
          className="px-5 py-2.5 rounded-full font-semibold text-sm"
        >
          Back to chat
        </button>
      </main>
    );
  }

  if (!payload) return <main className="min-h-dvh bg-background" />;

  return <PptxPreviewScreen url={payload.url} chatName={payload.chatName || payload.title} onBack={goBack} />;
};

export default SlidesFilePreviewPage;