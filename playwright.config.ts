import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const localChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 3,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    screenshot: "off",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync(localChrome) ? localChrome : undefined),
    },
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: "npm run build && npm run preview -- --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      env: { VITE_AUTH_ENABLED: "false" },
    },
    {
      command:
        "node node_modules/vite/bin/vite.js build --outDir dist-auth-tests && node node_modules/vite/bin/vite.js preview --outDir dist-auth-tests --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      // Always own this preview so mocked credentials cannot reach an unrelated app.
      reuseExistingServer: false,
      env: {
        VITE_AUTH_ENABLED: "true",
        VITE_SUPABASE_URL: "https://campuspass-auth-fixture.example.test",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser-fixture",
      },
    },
  ],
});
