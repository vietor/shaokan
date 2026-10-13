import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// @ts-expect-error process is a nodejs global
const platform = process.env.TAURI_ENV_PLATFORM;

export default defineConfig(async () => ({
  plugins: [react()],

  clearScreen: false,
  build: {
    target: platform === "windows" ? "chrome105" : "safari13",
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
