// @ts-check
const { defineConfig } = require('@playwright/test');

const port = process.env.PORT || '3000';
const baseURL = process.env.BASE_URL || `http://localhost:${port}`;

/** Cuando npm run test:all ya levantó el servidor (scripts/run-all-tests.mjs). */
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: 'node server.js',
          url: `${baseURL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
});
