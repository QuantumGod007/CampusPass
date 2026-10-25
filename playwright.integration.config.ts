import { defineConfig } from "@playwright/test";
const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error(
    "Start the isolated Supabase test stack and export TEST_SUPABASE_* first.",
  );
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
  throw new Error(
    "Integration browser tests require an isolated loopback Supabase stack.",
  );
export default defineConfig({
  testDir: "./integration",
  workers: 1,
  timeout: 90000,
  reporter: [["list"]],
  outputDir: "test-results/integration",
  use: {
    baseURL: "http://127.0.0.1:4175",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js build --outDir dist-integration && node node_modules/vite/bin/vite.js preview --outDir dist-integration --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    env: {
      VITE_AUTH_ENABLED: "true",
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    },
  },
});
