// شريط أدوات ثابت لوضع الفيديو: نمط UGC + توليد More aspect ratios لنفس الفيديو.

import { useEffect, useState } from "react";
import { Smartphone, Ratio } from "lucide-react";
import { loadVideoTools, saveVideoTools } from "@/lib/media/videoTools";

const ASPECTS = ["16:9", "9:16", "1:1", "4:5"];

export default function VideoToolsBar() {
  const [ugc, setUgc] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);

  useEffect(() => {
    const p = loadVideoTools();
    setUgc(p.ugc);
    setExtra(p.extraAspects);
  }, []);

  const persist = (next: { ugc?: boolean; extraAspects?: string[] }) => {
    const value = { ugc, extraAspects: extra, ...next };
    setUgc(value.ugc);
    setExtra(value.extraAspects);
    saveVideoTools(value);
  };

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium border transition active:scale-[0.97] ${
      active
        ? "bg-foreground/[0.16] border-foreground/25 text-foreground"
        : "bg-foreground/[0.07] border-foreground/10 text-foreground/75 hover:text-foreground"
    }`;

  return (
    <div className="px-2 pt-2 pb-1 flex flex-wrap items-center gap-2" dir="auto">
      <button type="button" className={chip(ugc)} onClick={() => persist({ ugc: !ugc })}>
        <Smartphone className="w-3.5 h-3.5" />
        UGC style
      </button>
      <span className="inline-flex items-center gap-1 text-[12px] text-foreground/50 px-1">
        <Ratio className="w-3.5 h-3.5" />
        More aspect ratios
      </span>
      {ASPECTS.map((a) => {
        const active = extra.includes(a);
        return (
          <button
            key={a}
            type="button"
            className={chip(active)}
            onClick={() =>
              persist({
                extraAspects: active ? extra.filter((x) => x !== a) : [...extra, a],
              })
            }
          >
            {a}
          </button>
        );
      })}
    </div>
  );
}
