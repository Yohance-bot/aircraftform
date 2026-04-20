/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(180, 68, 8, 0.18)",
      },
      keyframes: {
        takeoff: {
          "0%":   { transform: "translate(-10vw, 60vh) rotate(-4deg)", opacity: "0" },
          "10%":  { opacity: "0.9" },
          "55%":  { transform: "translate(55vw, 25vh) rotate(-14deg)", opacity: "0.9" },
          "100%": { transform: "translate(120vw, -10vh) rotate(-22deg)", opacity: "0" },
        },
        dashfloat: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-40px)" },
        },
        cloud: {
          "0%":   { transform: "translateX(-20vw)" },
          "100%": { transform: "translateX(120vw)" },
        },
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-6px)" },
        },
      },
      animation: {
        takeoff: "takeoff 9s ease-in-out infinite",
        dashfloat: "dashfloat 1.2s linear infinite",
        cloud: "cloud 60s linear infinite",
        bob: "bob 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
