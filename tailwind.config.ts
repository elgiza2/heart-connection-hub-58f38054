import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ["Dela Gothic One", "sans-serif"],
        body: ["Inter", "sans-serif"],
        sora: ["Sora", "system-ui", "sans-serif"],
        manrope: ["Manrope", "system-ui", "sans-serif"],
        grotesk: ["'Space Grotesk'", "system-ui", "sans-serif"],
        dm: ["'DM Sans'", "system-ui", "sans-serif"],
        geist: ["Geist", "system-ui", "sans-serif"],
      },
      colors: {
        paper: "#f2f2f7",
        "paper-2": "#e5e5e7",
        ink: "#000000",
        "ink-soft": "#1c1c1f",
        // Unified Megsy brand tokens — use these instead of hardcoded hex
        // (See `Megsy Brand Tokens` block in src/index.css.)
        brand: {
          ink: "hsl(var(--brand-ink))",            // #0A0A0A
          parchment: "hsl(var(--brand-parchment))",// #F5F0E8
          action: "hsl(var(--brand-action))",      // #3B82F6
          mint: "hsl(var(--brand-mint))",          // #A8E6CF
          blush: "hsl(var(--brand-blush))",        // #FFB3D1
          muted: "hsl(var(--brand-muted))",        // #8A8A8A
        },
        surface: {
          1: "hsl(var(--surface-1))", // #161616
          2: "hsl(var(--surface-2))", // #1A1A1A
          3: "hsl(var(--surface-3))", // #1F1F1F
          4: "hsl(var(--surface-4))", // #2A2A2A
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        silver: {
          DEFAULT: "hsl(var(--silver))",
          bright: "hsl(var(--silver-bright))",
          dark: "hsl(var(--silver-dark))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        "value-yellow": "hsl(var(--value-yellow))",
        "value-ink": "hsl(var(--value-ink))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // iOS-grade radius scale (Apple HIG: 10/14/22/38)
        "ios-sm": "10px",
        "ios-md": "14px",
        "ios-lg": "22px",
        "ios-xl": "38px",
      },
      spacing: {
        // Safe-area shortcuts — usable as p-safe-t, pb-safe-b, mt-safe-t, etc.
        "safe-t": "var(--safe-top)",
        "safe-b": "var(--safe-bottom)",
        "safe-l": "var(--safe-left)",
        "safe-r": "var(--safe-right)",
        // Keyboard inset (see useVisualViewport hook).
        keyboard: "var(--keyboard-inset, 0px)",
      },
      height: {
        // Dynamic viewport units — resilient to iOS URL-bar collapse.
        svh: "100svh",
        lvh: "100lvh",
        dvh: "100dvh",
      },
      minHeight: {
        svh: "100svh",
        lvh: "100lvh",
        dvh: "100dvh",
      },
      maxHeight: {
        svh: "100svh",
        lvh: "100lvh",
        dvh: "100dvh",
      },
      zIndex: {
        // Unified z-index scale — replaces ad-hoc z-[100], z-[9999], etc.
        nav: "30",
        dropdown: "40",
        sticky: "50",
        overlay: "60",
        drawer: "70",
        modal: "80",
        popover: "90",
        toast: "100",
      },
      backdropBlur: {
        // Cap extreme blur at perf-safe values (iOS uses ≤40px for live blur)
        "3xl": "40px",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "dropdown-in": {
          "0%": { opacity: "0", transform: "scale(0.85) translateY(-8px)" },
          "60%": { opacity: "1" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "dropdown-out": {
          "0%": { opacity: "1", transform: "scale(1) translateY(0)" },
          "100%": { opacity: "0", transform: "scale(0.9) translateY(-6px)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-33.3333%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "dropdown-in": "dropdown-in 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
        "dropdown-out": "dropdown-out 0.18s ease-in forwards",
        marquee: "marquee 45s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("tailwindcss-rtl")],
} satisfies Config;
