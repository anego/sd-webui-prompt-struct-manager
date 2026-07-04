import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: "node", // フロントエンドのビジネスロジック検証に特化するため、最速の node 環境を使用します
    include: ["tests/**/*.spec.ts"],
    // Playwright の E2E テストおよびデザインテストは、Vitest の実行対象から除外します
    exclude: [
      "tests/e2e.spec.ts",
      "tests/layout.spec.ts",
      "tests/design.spec.ts"
    ],
  },
});
