const { defineConfig } = require("@playwright/test");
// Standalone: playwright.config.cjs delegates here, so importing it would cycle.
module.exports = defineConfig({
  testDir: "./tests/phone",
  timeout: 90000,
  expect: { timeout: 20000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  outputDir: ".test-data/node-service-m2/results",
  use: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15000,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
