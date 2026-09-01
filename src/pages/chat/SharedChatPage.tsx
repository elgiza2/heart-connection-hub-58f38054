/** @doc Public read-only view of a shared chat conversation. */
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Copy, Check, Share2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ChatMessage from "@/components/chat/ChatMessage";
import SEOHead from "@/components/common/SEOHead";
import { translateExactText, useUserLang } from "@/lib/authI18n";
import { toast } from "sonner";
import { AuiProvider } from "./adapters/aui/AuiProvider";

interface Message {
  role: "user" | "assistant";
  content: string;
  images?: string[];
}


const SharedChatPage = () => {
  const lang = useUserLang();
  const tx = (text: string) => translateExactText(text, lang);
  const { shareId } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/share/${shareId}` : ""),
    [shareId],
  );

  const preview = useMemo(() => {
    const firstUser = messages.find((m) => m.role === "user")?.content || "";
    const firstAssistant = messages.find((m) => m.role === "assistant")?.content || "";
    const raw = (firstUser + " — " + firstAssistant).replace(/[#*_`>\[\]()]/g, " ").replace(/\s+/g, " ").trim();
    return raw.slice(0, 155) || tx("A conversation shared from Megsy AI.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(tx("Link copied"));
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(tx("Couldn't copy"));
    }
  };

  const shareTo = (platform: "whatsapp" | "x" | "telegram" | "facebook") => {
    const text = encodeURIComponent(`${title || tx("A conversation on Megsy AI")}\n${shareUrl}`);
    const url = encodeURIComponent(shareUrl);
    const t = encodeURIComponent(title || "Megsy AI");
    const urls: Record<typeof platform, string> = {
      whatsapp: `https://wa.me/?text=${text}`,
      x: `https://twitter.com/intent/tweet?url=${url}&text=${t}`,
      telegram: `https://t.me/share/url?url=${url}&text=${t}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    };
    window.open(urls[platform], "_blank", "noopener,noreferrer,width=640,height=560");
  };

  const nativeShare = async () => {
    if (typeof navigator === "undefined" || !(navigator as any).share) {
      return copyLink();
    }
    try {
      await (navigator as any).share({ title: title || "Megsy AI", text: preview, url: shareUrl });
    } catch { /* dismissed */ }
  };

  const remix = () => {
    const firstUser = messages.find((m) => m.role === "user")?.content?.trim();
    if (firstUser) {
      try {
        sessionStorage.setItem("megsy:remix-prompt", firstUser);
      } catch { /* storage disabled */ }
    }
    navigate("/chat?remix=1");
  };




  useEffect(() => {
    if (!shareId) return;
    (async () => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, title, is_shared, created_at")
        .eq("share_id", shareId)
        .eq("is_shared", true)
        .single();

      if (!conv) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setTitle(conv.title);
      setCreatedAt(conv.created_at);

      const { data: msgs } = await supabase
        .from("messages")
        .select("role, content, images")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });

      if (msgs) {
        setMessages(
          msgs.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            images: m.images || undefined,
          })),
        );
      }
      setLoading(false);
    })();
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <h2 className="text-xl font-bold text-foreground">{tx("Chat not found")}</h2>
          <p className="text-sm text-muted-foreground">
            {tx("This shared chat doesn't exist or has been made private.")}
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-500 text-foreground text-sm font-semibold hover:opacity-95 transition"
          >
            {tx("Go to Megsy")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuiProvider messages={messages as any} isRunning={false}>
    <div className="min-h-dvh bg-background flex flex-col">
      <SEOHead
        title={title || tx("Shared chat")}
        description={preview}
        path={`/share/${shareId}`}
        type="article"
      />
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/75 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/")}
            className="font-display text-xl font-black uppercase tracking-tight text-foreground"
          >
            MEGSY
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={nativeShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-border/50 text-[13px] font-medium text-foreground transition"
              aria-label={tx("Share")}
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tx("Share")}</span>
            </button>
            <button
              onClick={remix}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/30 text-[13px] font-semibold text-primary transition"
              aria-label={tx("Remix")}
              title={tx("Continue this conversation in your own chat")}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tx("Remix")}</span>
            </button>
            <button
              onClick={() => navigate("/auth")}
              className="px-4 py-1.5 rounded-full bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition"
            >
              {tx("Join Megsy")}
            </button>
          </div>
        </div>
      </header>

      {/* Conversation */}
      <main className="flex-1 w-full">
        <div className="max-w-3xl mx-auto px-4 md:px-6 pt-8 pb-10">
          {/* Title block */}
          <div className="mb-6 pb-6 border-b border-border/40">
            <h1 className="text-[26px] md:text-[32px] font-bold tracking-tight text-foreground leading-tight">
              {title || tx("Shared chat")}
            </h1>
            {createdAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(createdAt).toLocaleDateString(lang || undefined, { year: "numeric", month: "short", day: "numeric" })}
                {" · "}
                {tx("Shared on Megsy AI")}
              </p>
            )}

            {/* Share bar */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-border/50 text-[12px] font-medium text-foreground transition"
      aria-label="Check"
    >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? tx("Copied") : tx("Copy link")}
              </button>
              <button onClick={() => shareTo("whatsapp")} className="px-3 py-1.5 rounded-full bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[12px] font-medium text-[#25D366] transition">
                WhatsApp
              </button>
              <button onClick={() => shareTo("x")} className="px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-border/50 text-[12px] font-medium text-foreground transition">
                X
              </button>
              <button onClick={() => shareTo("telegram")} className="px-3 py-1.5 rounded-full bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border border-[#0088cc]/30 text-[12px] font-medium text-[#0088cc] transition">
                Telegram
              </button>
              <button onClick={() => shareTo("facebook")} className="px-3 py-1.5 rounded-full bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border border-[#1877F2]/30 text-[12px] font-medium text-[#1877F2] transition">
                Facebook
              </button>
            </div>
          </div>

          {/* Messages */}
          <div data-no-translate="true" className="space-y-2">
            {messages.map((msg, i) => (
              <ChatMessage key={i} role={msg.role} content={msg.content} images={msg.images} />
            ))}
          </div>

          {/* End divider */}
          <div className="mt-10 flex items-center gap-3 text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
            <div className="flex-1 h-px bg-border/50" />
            {tx("End of conversation")}
            <div className="flex-1 h-px bg-border/50" />
          </div>
        </div>


        {/* CTA banner */}
        <section className="px-4 md:px-6 pb-16">
          <div className="max-w-3xl mx-auto relative overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-br from-purple-600/10 via-background to-fuchsia-500/10 px-6 py-10 md:px-10 md:py-14 text-center">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-purple-500/20 blur-[120px] pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-foreground/5 border border-border/50 text-[11px] font-medium text-foreground/80 mb-4">
                {tx("Powered by Megsy AI")}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                {tx("Start your own conversation")}
              </h2>
              <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-md mx-auto">
                {tx("Get answers, build, research, and create — all in one place. Free to start.")}
              </p>
              <button
                onClick={() => navigate("/auth")}
                className="mt-6 px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-500 text-foreground text-sm font-semibold hover:opacity-95 transition"
              >
                {tx("Join Megsy free")}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
    </AuiProvider>
  );
};

export default SharedChatPage;
