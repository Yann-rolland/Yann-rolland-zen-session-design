import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Ensure Vite serves index.html at "/" (SPA mode). Without this, dev server can behave like "custom"
  // and return 404 for "/" while still serving internal /@vite/* endpoints.
  appType: "spa",
  build: {
    // Enable production sourcemaps to diagnose intermittent DOM errors
    // like NotFoundError: removeChild/insertBefore in Vercel builds.
    sourcemap: true,
  },
  server: {
    // Use IPv4-friendly host so http://127.0.0.1 works (Windows often struggles with IPv6-only dev servers)
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
