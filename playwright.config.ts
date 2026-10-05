import { defineConfig, devices } from "@playwright/test";

// Run the same browser assertions against an already published static build.
// An external base URL never launches a development server or local service.
const externalBaseURL = process.env.ORBIT_E2E_BASE_URL;
const localBaseURL = "http://127.0.0.1:5173/orbit-agentic-commerce/";

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
    baseURL: externalBaseURL ?? localBaseURL,
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
    {
      name: "webkit-phone",
      testMatch: "**/quality.spec.ts",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "firefox-smoke",
      testMatch: "**/quality.spec.ts",
      grep: /offline sample smoke/,
      use: {
        ...devices["Desktop Firefox"],
        browserName: "firefox",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command:
          process.env.ORBIT_E2E_BUILT === "1"
            ? "npm run preview -- --port 5173 --strictPort"
            : "npm run dev -- --port 5173 --strictPort",
        url: localBaseURL,
        reuseExistingServer:
          !process.env.CI && process.env.ORBIT_E2E_BUILT !== "1",
        timeout: 30_000,
      },
});
