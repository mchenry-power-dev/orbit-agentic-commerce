import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173/orbit-agentic-commerce/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1365, height: 900 },
      },
    },
    {
      name: "narrow",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command:
      process.env.ORBIT_E2E_BUILT === "1"
        ? "npm run preview -- --port 5173 --strictPort"
        : "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/orbit-agentic-commerce/",
    reuseExistingServer: !process.env.CI && process.env.ORBIT_E2E_BUILT !== "1",
    timeout: 30_000,
  },
});
