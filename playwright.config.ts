import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120000,
  reporter: "html",
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:7860",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 30000,
    navigationTimeout: 20000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
