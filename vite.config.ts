// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import { resolve } from "path";
import { readFileSync } from "fs";

import vuetify from "vite-plugin-vuetify";

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true }), cssInjectedByJsPlugin()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": JSON.stringify({ NODE_ENV: "production" }),
    "process": JSON.stringify({ env: { NODE_ENV: "production" } }),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toLocaleString()),
    __PSM_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 1048576, // 1MB - Force inline fonts to avoid path issues
    lib: {
      entry: resolve(__dirname, "src/main.ts"),
      name: "PromptStructManager",
      fileName: () => "index.js",
      formats: ["es"],
    },
  },
});
