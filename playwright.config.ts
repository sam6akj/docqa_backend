import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const PORT = 4000;

export default defineConfig({
  testDir: "./tests",
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    baseURL: `http://localhost:${PORT}`,
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "api",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        storageState: "tests/.auth/session.json",
      },
    },
  ],

  webServer: {
    command: "npx tsx src/server.ts",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: {
      ...(process.env as Record<string, string>),
      NODE_ENV: "test",
      PORT: String(PORT),
    },
  },
});