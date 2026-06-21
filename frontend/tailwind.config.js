/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- Existing summer-camp palette (kept intact) ---
        cream: "#FDF6EC",
        "cream-deep": "#F6EAD4",
        brand: {
          50: "#FFF4EA",
          100: "#FFE4CC",
          200: "#FFC999",
          300: "#FFA966",
          400: "#FB8A3C",
          500: "#F97316",
          600: "#E0590A",
          700: "#B44408",
        },
        // --- New sky-blue signature palette for the storefront ---
        aero: {
          50: "#ECF7FF",
          100: "#D5EEFF",
          200: "#AEDFFF",
          300: "#79C8FF",
          400: "#38ABFF",
          500: "#0E90F1", // signature sky blue — the brand owns this
          600: "#0073D6",
          700: "#005AAD",
          800: "#0A4685",
          900: "#0B2E52",
        },
        ink: "#0B1220",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "Archivo",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tightest: "-0.05em",
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(180, 68, 8, 0.18)",
        sky: "0 22px 50px -24px rgba(14, 144, 241, 0.45)",
        lift: "0 34px 70px -28px rgba(11, 18, 32, 0.30)",
        glow: "0 0 0 1px rgba(14,144,241,0.12), 0 18px 40px -18px rgba(14,144,241,0.45)",
      },
      keyframes: {
        // existing camp keyframes
        takeoff: {
          "0%": { transform: "translate(-10vw, 60vh) rotate(-4deg)", opacity: "0" },
          "10%": { opacity: "0.9" },
          "55%": { transform: "translate(55vw, 25vh) rotate(-14deg)", opacity: "0.9" },
          "100%": { transform: "translate(120vw, -10vh) rotate(-22deg)", opacity: "0" },
        },
        dashfloat: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-40px)" },
        },
        cloud: {
          "0%": { transform: "translateX(-20vw)" },
          "100%": { transform: "translateX(120vw)" },
        },
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        // new storefront keyframes
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-14px)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        takeoff: "takeoff 9s ease-in-out infinite",
        dashfloat: "dashfloat 1.2s linear infinite",
        cloud: "cloud 60s linear infinite",
        bob: "bob 4s ease-in-out infinite",
        marquee: "marquee 32s linear infinite",
        floaty: "floaty 6s ease-in-out infinite",
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,0.61,0.36,1) both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};
