import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  clearScreen: false,
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
      ignored: ["**/src-tauri/**", "**/goals/**", "**/tasks/**", "**/platforms/**", "**/telegram/**", "**/sessions/**", "**/mcp/**", "**/skills/**", "**/logs/**", "**/temp/**"],
    },
  },

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        pet: resolve(__dirname, "pet/index.html"),
      },
    },
  },
}));
