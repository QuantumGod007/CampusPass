import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//,
              priority: 30,
            },
            {
              name: "motion-vendor",
              test: /node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//,
              priority: 20,
            },
            {
              name: "validation-vendor",
              test: /node_modules\/(zod|react-hook-form|@hookform)\//,
              priority: 10,
            },
            {
              name: "ui-vendor",
              test: /node_modules\/(@radix-ui|@floating-ui|react-remove-scroll|aria-hidden|lucide-react)\//,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/tests/setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
