import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev we proxy /api to the local FastAPI server so the frontend can call
// fetch("/api/...") directly. In production the app reads VITE_API_URL and
// prefixes all API calls with it (see `src/api.js`).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
