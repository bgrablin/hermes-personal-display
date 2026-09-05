import { defineConfig, devices } from '@playwright/test';

// Use Playwright's matching Chromium by default, including Linux CI. Physical
// kiosk verification can explicitly select its installed browser.
const executablePath = process.env.HERMES_TEST_CHROMIUM;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 320, height: 480 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/src/character-runtime.html?kiosk=1&mode=idle_watch',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium-kiosk',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 480 },
        launchOptions,
      },
    },
    {
      name: 'minix-sf10t-landscape',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1280 },
        launchOptions,
      },
    },
  ],
});
