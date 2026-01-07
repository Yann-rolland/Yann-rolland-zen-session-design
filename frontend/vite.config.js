import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Important: on sert le frontend depuis le backend sous /ui/
  // (évite de casser l'API /generate en prod + évite le conflit /assets (audio) vs /assets (JS)).
  base: "/ui/",
  plugins: [react()],
  server: {
    port: 5173,
  },
});

