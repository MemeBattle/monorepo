import { defineConfig } from '@playwright/test'
import { devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config = defineConfig({
  testDir: './e2e/tests',
  /* Maximum time one test can run for. */
  timeout: 30 * 1000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 5000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 0,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    baseURL: process.env.LIGRETTO_APP_URL || 'http://localhost:5173',
    testIdAttribute: 'data-test-id',
  },

  /*
   * Start the vite dev server automatically when it is not already running.
   * `reuseExistingServer: true` makes Playwright probe the url first and reuse
   * the app already listening on the port (e.g. the one started by CI),
   * falling back to `command` only when nothing responds.
   */
  webServer: {
    command: 'pnpm start:dev',
    url: process.env.LIGRETTO_APP_URL || 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    /*
     * Onboarding and card drag placement have narrow-screen interactions, so both run on a phone viewport.
     * Backend-dependent game.spec.ts stays desktop-only.
     */
    {
      name: 'mobile-chrome',
      testMatch: /(?:onboarding|card-placement)\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
})

export default config
