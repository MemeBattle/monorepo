import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6006'
const output = process.env.STORYBOOK_TEST_OUTPUT ?? './test-results/storybook'

export default defineConfig({
  testDir: './storybook-tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  outputDir: `${output}/artifacts`,
  reporter: [['list'], ['html', { outputFolder: `${output}/report`, open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Serve the built Storybook, independently of the real-CAS E2E server.
  webServer: process.env.STORYBOOK_URL
    ? undefined
    : {
        cwd: '../..',
        command: 'pnpm exec vite preview --host 127.0.0.1 --port 6006 --strictPort --outDir storybook-static',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
})
