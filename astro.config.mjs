import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  adapter: cloudflare(),
  site: process.env.PUBLIC_SITE_URL ?? "https://goodcoiner.com",
  vite: {
    plugins: [tailwindcss()],
  },
});
