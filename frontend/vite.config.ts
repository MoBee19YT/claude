import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works when served from a GitHub Pages
  // project subpath (https://<user>.github.io/<repo>/) without hardcoding
  // the repo name here.
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
});
