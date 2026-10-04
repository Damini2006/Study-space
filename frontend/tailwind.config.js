/** @type {import('tailwindcss').Config} */

/**
 * Colour helper: wraps a CSS variable so Tailwind can apply opacity
 * modifiers (bg-primary/60, border-border/70, from-primary/12 ...).
 * A bare `var(--x)` value makes Tailwind skip those utilities entirely,
 * so every translucent tint in the app rendered as fully transparent.
 */
const v = (name) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: v("background"),
        foreground: v("foreground"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        card: v("card"),
        "card-foreground": v("card-foreground"),
        popover: v("popover"),
        "popover-foreground": v("popover-foreground"),
        primary: {
          DEFAULT: v("primary"),
          foreground: v("primary-foreground"),
          soft: v("primary-soft"),
        },
        secondary: {
          DEFAULT: v("secondary"),
          foreground: v("secondary-foreground"),
        },
        muted: {
          DEFAULT: v("muted"),
          foreground: v("muted-foreground"),
        },
        accent: {
          DEFAULT: v("accent"),
          foreground: v("accent-foreground"),
        },
        destructive: {
          DEFAULT: v("destructive"),
          foreground: v("destructive-foreground"),
        },
        success: {
          DEFAULT: v("success"),
          foreground: v("success-foreground"),
          bg: v("success-bg"),
        },
        warning: {
          DEFAULT: v("warning"),
          foreground: v("warning-foreground"),
          bg: v("warning-bg"),
        },
        info: {
          DEFAULT: v("info"),
          foreground: v("info-foreground"),
          bg: v("info-bg"),
        },
        border: v("border"),
        input: v("input"),
        ring: v("ring"),
        "on-primary": v("on-primary"),
        citation: {
          DEFAULT: v("citation-bg"),
          foreground: v("citation-text"),
        },
        chart: {
          1: v("chart-1"),
          2: v("chart-2"),
          3: v("chart-3"),
          4: v("chart-4"),
          5: v("chart-5"),
          6: v("chart-6"),
        },
        heatmap: {
          1: v("heat-1"),
          2: v("heat-2"),
          3: v("heat-3"),
          4: v("heat-4"),
          5: v("heat-5"),
        },
        rating: {
          again: v("rating-again"),
          hard: v("rating-hard"),
          good: v("rating-good"),
          easy: v("rating-easy"),
        },
      },
      // Explicit 0-100 table so ANY `/NN` tint in the source compiles.
      // Tailwind's default scale skips 12, 15, 35, 45 …, and merging a
      // bare array leaves raw integers (12) which resolve to 1200% alpha.
      opacity: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [String(i), (i / 100).toString()])
      ),
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        blink: { "50%": { opacity: "0" } },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        "slide-up": "slide-up 220ms ease-out",
        shimmer: "shimmer 1.6s infinite",
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [],
};
