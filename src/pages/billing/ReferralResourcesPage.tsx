/** @doc Marketing kit for affiliates — banners, videos, copy snippets. */
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Play, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  PAGE_BG,
  SURFACE,
  SURFACE_2,
  BORDER,
  TEXT,
  MUTED,
  INK,
  YELLOW,
  MINT,
  PINK,
  LAVENDER,
  PEACH,
} from "./ReferralsPage";

import img1 from "@/assets/referral-resources/8a660ebc-02eb-4bf9-8071-434b3ecebf2b.jpg.asset.json";
import img2 from "@/assets/referral-resources/ea149eef-f218-4eae-a678-823690790473.jpg.asset.json";
import img3 from "@/assets/referral-resources/35e84332-5170-4705-a606-c1515b4d4cbb.jpg.asset.json";
import img4 from "@/assets/referral-resources/bf0cd16c-2121-4714-bd1a-5d9f23018a4e.jpg.asset.json";
import img5 from "@/assets/referral-resources/0d2a968c-93ca-48c5-be1d-56dba73af9bc.jpg.asset.json";
import img6 from "@/assets/referral-resources/a9578599-b783-4aaa-8a3e-f475fa7136eb.jpg.asset.json";
import img7 from "@/assets/referral-resources/37e39692-c5a5-4660-b13b-b43330e13178.jpg.asset.json";
import img8 from "@/assets/referral-resources/cc1d3e35-ac22-4d2c-804d-3fb57f42adf0.jpg.asset.json";
import img9 from "@/assets/referral-resources/7ab7435f-4b51-46d7-a733-b0ffe71dfb88.jpg.asset.json";
import img10 from "@/assets/referral-resources/91783fb9-2aa9-4c2d-af93-6a2c2b269946.jpg.asset.json";
import img11 from "@/assets/referral-resources/3f818441-a073-4950-af74-cf694a1ff7d5.jpg.asset.json";
import img12 from "@/assets/referral-resources/0956be32-9b5a-4531-a590-978f021517c6.jpg.asset.json";
import img13 from "@/assets/referral-resources/d645a5b2-e364-45f3-9bf9-5c2b61d8fe3b.jpg.asset.json";
import img14 from "@/assets/referral-resources/3867aa47-10de-4e99-b330-7c0b8b71b9ff.jpg.asset.json";
import vid1 from "@/assets/referral-resources/agents-vertical.mp4.asset.json";
import vid2 from "@/assets/referral-resources/megsy-problem.mp4.asset.json";
import vid3 from "@/assets/referral-resources/megsy-remotion-1x1.mp4.asset.json";
import vid4 from "@/assets/referral-resources/megsy-faceswap.mp4.asset.json";
import vid5 from "@/assets/referral-resources/megsy-talking.mp4.asset.json";
import vid6 from "@/assets/referral-resources/megsy-curious-1x1.mp4.asset.json";

type Asset = { url: string; original_filename: string; content_type: string };

const IMAGES: { asset: Asset; title: string; tone: string }[] = [
  { asset: img1 as Asset, title: "Your AI Studio", tone: YELLOW },
  { asset: img2 as Asset, title: "Prompt to Masterpiece", tone: PINK },
  { asset: img3 as Asset, title: "One Simple Plan", tone: PEACH },
  { asset: img4 as Asset, title: "Create Without Limits", tone: LAVENDER },
  { asset: img5 as Asset, title: "Unlimited Images", tone: MINT },
  { asset: img6 as Asset, title: "All in One", tone: YELLOW },
  { asset: img7 as Asset, title: "All AI. One App.", tone: PINK },
  { asset: img8 as Asset, title: "AI Video in Seconds", tone: PEACH },
  { asset: img9 as Asset, title: "Code with AI", tone: MINT },
  { asset: img10 as Asset, title: "An OS Built For ✦", tone: LAVENDER },
  { asset: img11 as Asset, title: "Just Megsy", tone: YELLOW },
  { asset: img12 as Asset, title: "Type it. See it.", tone: PINK },
  { asset: img13 as Asset, title: "Ship Code 10× Faster", tone: PEACH },
  { asset: img14 as Asset, title: "Replace Your AI Stack", tone: MINT },
];

const VIDEOS: { asset: Asset; title: string; tone: string }[] = [
  { asset: vid1 as Asset, title: "Agents Reel", tone: LAVENDER },
  { asset: vid2 as Asset, title: "Megsy Problem Solver", tone: MINT },
  { asset: vid3 as Asset, title: "Remotion Demo", tone: YELLOW },
  { asset: vid4 as Asset, title: "Face Swap", tone: PINK },
  { asset: vid5 as Asset, title: "Talking Avatar", tone: PEACH },
  { asset: vid6 as Asset, title: "Curious Megsy", tone: LAVENDER },
];

const downloadAsset = async (asset: Asset) => {
  try {
    const res = await fetch(asset.url);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = asset.original_filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  } catch {
    toast.error("Download failed");
  }
};

const ReferralResourcesPage = () => {
  const navigate = useNavigate();

  return (
    <div
      dir="ltr"
      className="min-h-[100dvh] antialiased"
      style={{
        backgroundColor: PAGE_BG,
        color: TEXT,
        fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif',
      }}
    >
      <header
        className="sticky top-0 z-40"
        style={{ backgroundColor: PAGE_BG, borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="-ml-1 grid h-11 w-11 place-items-center rounded-full transition active:scale-90"
            style={{ color: TEXT }}
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
          </button>
          <span style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>Resources</span>
          <span className="w-11" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 pb-20 pt-4">
        <div className="text-center">
          <h1
            className="text-[36px] leading-[0.95] tracking-tight"
            style={{ fontWeight: 900, color: TEXT, letterSpacing: "-0.02em" }}
          >
            Share-ready kit
          </h1>
          <p
            className="mx-auto mt-3 max-w-xs text-[15px] leading-snug"
            style={{ color: MUTED, fontWeight: 500 }}
          >
            Download these and post on{" "}
            <span style={{ color: YELLOW, fontWeight: 800 }}>Instagram</span>,{" "}
            <span style={{ color: PINK, fontWeight: 800 }}>TikTok</span> or anywhere else.
          </p>
        </div>

        {/* Videos */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Play className="h-4 w-4" strokeWidth={3} style={{ color: LAVENDER }} />
            <h2
              className="text-[14px] uppercase tracking-wider"
              style={{ fontWeight: 800, color: TEXT }}
            >
              Videos
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {VIDEOS.map((v) => (
              <div
                key={v.asset.url}
                className="overflow-hidden rounded-2xl"
                style={{ backgroundColor: SURFACE, border: `2px solid ${BORDER}` }}
              >
                <div className="relative aspect-[9/16] w-full" style={{ backgroundColor: "hsl(var(--background))" }}>
                  <video
                    src={v.asset.url}
                    className="h-full w-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="truncate text-[13px]" style={{ color: TEXT, fontWeight: 700 }}>
                    {v.title}
                  </span>
                  <button
                    onClick={() => downloadAsset(v.asset)}
                    aria-label="Download"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    style={{
                      backgroundColor: v.tone,
                      color: INK,
                      border: `2px solid ${INK}`,
                      boxShadow: `3px 3px 0 ${v.tone}40`,
                    }}
                  >
                    <Download className="h-4 w-4" strokeWidth={2.8} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Images */}
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4" strokeWidth={3} style={{ color: YELLOW }} />
            <h2
              className="text-[14px] uppercase tracking-wider"
              style={{ fontWeight: 800, color: TEXT }}
            >
              Posters
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {IMAGES.map((it) => (
              <div
                key={it.asset.url}
                className="overflow-hidden rounded-2xl"
                style={{ backgroundColor: SURFACE, border: `2px solid ${BORDER}` }}
              >
                <div
                  className="relative aspect-square w-full overflow-hidden"
                  style={{ backgroundColor: SURFACE_2 }}
                >
                  <img decoding="async"
                    src={it.asset.url}
                    alt={it.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="truncate text-[13px]" style={{ color: TEXT, fontWeight: 700 }}>
                    {it.title}
                  </span>
                  <button
                    onClick={() => downloadAsset(it.asset)}
                    aria-label="Download"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    style={{
                      backgroundColor: it.tone,
                      color: INK,
                      border: `2px solid ${INK}`,
                      boxShadow: `3px 3px 0 ${it.tone}40`,
                    }}
                  >
                    <Download className="h-4 w-4" strokeWidth={2.8} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ReferralResourcesPage;
