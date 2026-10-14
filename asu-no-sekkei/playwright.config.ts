import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "Asia/Tokyo",
    locale: "ja-JP",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } }, testIgnore: /mobile/ },
    // iPhone 14 の画面サイズ・タッチ・DPR（ブラウザエンジンは Chromium）
    { name: "mobile", use: { ...devices["iPhone 14"], browserName: "chromium", defaultBrowserType: "chromium" }, testMatch: /mobile/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
