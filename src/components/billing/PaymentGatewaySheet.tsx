/** @doc Payment options menu — minimal bordered rows, no icons, no descriptions. */
import { memo, useEffect, useState } from "react";
import { m as motion } from "framer-motion";

import { IOS_SPRING as iosSpring } from "@/pages/chat/constants/motion";

function useIsLightTheme() {
  const [light, setLight] = useState(
    typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "light",
  );
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setLight(el.getAttribute("data-theme") === "light");
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    update();
    return () => obs.disconnect();
  }, []);
  return light;
}


export type PayOption = "global" | "local" | "wallets";
export type Gateway = PayOption; // backwards compat

const mobileFont =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (option: PayOption) => void | Promise<void>;
  loading?: PayOption | null;
  title?: string;
  subtitle?: string;
  /** Restrict which options are shown (e.g. Kashier-only on the Egypt site). */
  options?: PayOption[];
  /** Override the label of one or more options. */
  labels?: Partial<Record<PayOption, string>>;
}

const ROWS: Array<{ id: PayOption; label: string }> = [
  { id: "global", label: "Global" },
  { id: "local", label: "Local" },
  { id: "wallets", label: "E-Wallets" },
];

function PaymentGatewaySheetImpl({
  open,
  onClose,
  onSelect,
  loading = null,
  title = "Choose payment method",
  subtitle = "Pick an option.",
  options,
  labels,
}: Props) {
  const isLight = useIsLightTheme();
  const c = isLight
    ? {
        sheetBg: "#ffffff",
        sheetText: "#0a0a0a",
        borderStrong: "rgba(0,0,0,0.10)",
        handle: "rgba(0,0,0,0.20)",
        subtitle: "rgba(0,0,0,0.55)",
        groupBg: "rgba(0,0,0,0.03)",
        groupBorder: "rgba(0,0,0,0.08)",
        rowBg: "rgba(0,0,0,0.04)",
        rowBorder: "rgba(0,0,0,0.08)",
        chevron: "rgba(0,0,0,0.45)",
        spinnerTrack: "rgba(0,0,0,0.20)",
        spinnerTop: "#0a0a0a",
        shadow: "0 22px 60px -12px rgba(0,0,0,0.25)",
      }
    : {
        sheetBg: "#000000",
        sheetText: "#ffffff",
        borderStrong: "rgba(255,255,255,0.10)",
        handle: "rgba(255,255,255,0.25)",
        subtitle: "rgba(255,255,255,0.50)",
        groupBg: "rgba(255,255,255,0.04)",
        groupBorder: "rgba(255,255,255,0.08)",
        rowBg: "rgba(255,255,255,0.05)",
        rowBorder: "rgba(255,255,255,0.08)",
        chevron: "rgba(255,255,255,0.40)",
        spinnerTrack: "rgba(255,255,255,0.25)",
        spinnerTop: "#ffffff",
        shadow: "0 22px 60px -12px rgba(0,0,0,0.8)",
      };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:justify-center"
      dir="ltr"
      style={{ background: isLight ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.55)" }}
    >
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={onClose}
      />
      <motion.div
        data-plus-menu
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.985 }}
        transition={{ duration: 0.16, ease: [0.22, 0.9, 0.3, 1] }}
        className="pointer-events-auto relative z-[101] w-full sm:max-w-[420px] sm:rounded-[28px] md:max-h-[70vh] overflow-y-auto rounded-t-[28px] px-4 sm:px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] flex flex-col"
        style={{
          fontFamily: mobileFont,
          background: c.sheetBg,
          color: c.sheetText,
          borderTop: `1px solid ${c.borderStrong}`,
          borderInline: `1px solid ${c.borderStrong}`,
          boxShadow: c.shadow,
        }}
      >
        <div className="sm:hidden pt-2.5 pb-2 flex items-center justify-center shrink-0">
          <div className="h-1.5 w-10 rounded-full" style={{ background: c.handle }} />
        </div>

        <div className="px-1 pt-1 pb-3">
          <p className="text-[14px] font-semibold leading-none" style={{ color: c.sheetText }}>{title}</p>
          <p className="text-[12px] mt-1 leading-snug" style={{ color: c.subtitle }}>{subtitle}</p>
        </div>

        <div
          className="flex flex-col gap-2 p-2.5 rounded-2xl"
          style={{
            background: c.groupBg,
            border: `1px solid ${c.groupBorder}`,
          }}
        >
          {ROWS.filter((row) => !options || options.includes(row.id)).map((row) => {
            const isLoading = loading === row.id;
            const disabled = loading !== null && !isLoading;
            return (
              <motion.button
                data-no-neo
                key={row.id}
                type="button"
                disabled={disabled || isLoading}
                whileTap={{ scale: disabled ? 1 : 0.985 }}
                transition={iosSpring}
                onClick={() => onSelect(row.id)}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3.5 text-left transition-colors"
                style={{
                  background: c.rowBg,
                  border: `1px solid ${c.rowBorder}`,
                  color: c.sheetText,
                }}
              >
                <span className="text-[15px] font-medium leading-[1.15]" style={{ color: c.sheetText }}>
                  {labels?.[row.id] ?? row.label}
                </span>
                {isLoading ? (
                  <span
                    className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
                    style={{ borderColor: c.spinnerTrack, borderTopColor: c.spinnerTop }}
                  />
                ) : (
                  <span className="shrink-0" style={{ color: c.chevron }} aria-hidden>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}


const PaymentGatewaySheet = memo(PaymentGatewaySheetImpl);
export default PaymentGatewaySheet;
