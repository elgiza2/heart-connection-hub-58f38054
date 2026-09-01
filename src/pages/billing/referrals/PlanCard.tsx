/** @doc Branded gift-card face used for every redeemable plan (Van Gogh art per plan). */
import logoMark from "@/assets/megsy-model-icon.png";
import starterArt from "@/assets/plan-starter-vg.jpg";
import proArt from "@/assets/plan-pro-vg.jpg";
import eliteArt from "@/assets/plan-elite-vg.jpg";

const ART: Record<string, string> = {
  starter: starterArt,
  pro: proArt,
  elite: eliteArt,
};

export default function PlanCard({
  plan,
  className = "",
  style,
}: {
  plan: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const art = ART[plan] ?? ART.starter;
  return (
    <div
      style={style}
      className={`theme-fixed relative flex flex-col justify-between overflow-hidden rounded-[18px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ${className}`}
    >
      <img
        src={art}
        alt=""
        width={768}
        height={512}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/25" />
      <div className="relative flex h-full flex-col justify-between p-3">
        <div className="flex items-center gap-1.5">
          <img
            src={logoMark}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            className="h-[22px] w-[22px] rounded-md object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]"
            style={{ filter: "brightness(0) invert(1) drop-shadow(0 2px 6px rgba(0,0,0,0.95))" }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "#fff", WebkitTextFillColor: "#fff", textShadow: "0 1px 6px rgba(0,0,0,1)" }}
          >
            Megsy
          </span>
        </div>
        <p
          className="text-[17px] font-bold capitalize leading-tight"
          style={{ color: "#fff", WebkitTextFillColor: "#fff", textShadow: "0 2px 10px rgba(0,0,0,1)" }}
        >
          {plan}
        </p>
      </div>

    </div>
  );
}
