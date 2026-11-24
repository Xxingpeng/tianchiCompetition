import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    // 资产是二进制 + JSON，不该被 base64 内联进 JS：内联后首屏体积不可控，
    // 也让 standards/00 §4 的"首屏非网格资源 ≤ 3 MB"门禁失去意义。
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    restoreMocks: true,
  },
});
