import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: Number(process.env.VITE_DEV_PORT ?? 8181),
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:3300',
        changeOrigin: false,
      },
    },
    allowedHosts: [
      "all",
      // "dev-dashboard.Soundpub.xyz",
      "dashboard.Soundpub.xyz",
      "https://dashboard.Soundpub.xyz",
      "dev.Soundpub.xyz",
      "https://dev.Soundpub.xyz",
      "localhost:8181",
      "localhost:8281",
      "localhost",
      "127.0.0.1",
      "dev-Soundpub.maskhar.com",
      "web.maskhar.com",
      "dev-dashboard.Soundpub.xyz"
    ]
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
}));
