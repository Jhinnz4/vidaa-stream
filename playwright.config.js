// @ts-check
const { defineConfig } = require('@playwright/test');
const PORT = Number(process.env.TEST_PORT) || 8090;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  workers: 2,
  use: { baseURL: `http://localhost:${PORT}`, headless: true, viewport: { width: 1280, height: 720 } },
  webServer: { command: `node tests/serve.js ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 20000 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
