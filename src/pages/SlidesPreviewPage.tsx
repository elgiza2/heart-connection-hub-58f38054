/** @doc Full-screen slides preview page — opens a generated deck as its own route (/slides/preview/:id). */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SlidesDeckCard, { type SlideDeck } from "@/components/chat/SlidesDeckCard";
import { readSlidesDeckForPreview } from "@/lib/slidesPreviewStore";

const SlidesPreviewPage = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<SlideDeck | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const d = readSlidesDeckForPreview(id);
    if (d) setDeck(d);
    else setNotFound(true);
  }, [id]);

  const handleClose = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  if (notFound) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p className="text-sm opacity-80">Preview not available. Please regenerate the deck.</p>
        <button
          onClick={() => navigate("/")}
          style={{ backgroundColor: "#ffffff", color: "#000000" }}
          className="px-5 py-2.5 rounded-full font-semibold text-sm"
        >
          Back to chat
        </button>
      </div>
    );
  }

  if (!deck) {
    return <div className="fixed inset-0 bg-background" />;
  }

  return <SlidesDeckCard deck={deck} hideCard autoOpen onClose={handleClose} />;
};

export default SlidesPreviewPage;
