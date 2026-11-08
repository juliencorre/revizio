import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Family scenarios reset their disposable backend between tests.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "artifacts/playwright-report.json" }]],
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4183",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "tablet-landscape",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1180, height: 820 },
        hasTouch: true,
        launchOptions: {
          executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        },
      },
    },
    {
      name: "tablet-portrait",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        launchOptions: {
          executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        },
      },
    },
    {
      name: "ipad-safari-landscape",
      use: {
        ...devices["iPad Pro 11"],
        viewport: { width: 1194, height: 834 },
        browserName: "webkit",
      },
    },
    {
      name: "ipad-safari-portrait",
      use: {
        ...devices["iPad Pro 11"],
        viewport: { width: 834, height: 1194 },
        browserName: "webkit",
      },
    },
  ],
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:4183",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
