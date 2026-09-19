import { defineConfig, devices } from '@playwright/test'

// The vite dev server the suite drives. The port is the CAS default `CAS_ORIGIN`;
// CAS_FRONTEND_PORT moves it when 5173 is taken, in which case CAS has to be
// started with `CAS_ORIGIN` and `CAS_CORS_ORIGINS` pointing at the new port.
// CAS itself is not started here (see docs/TESTS.md): vite proxies `/api` to it,
// wherever `CAS_API_PROXY_TARGET` says it listens.
const port = Number(process.env.CAS_FRONTEND_PORT ?? 5173)
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  // A test creates its own account and never sees another's, so files and tests run side by side against one CAS.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'on-failure' }]],
  use: {
    baseURL,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // The virtual authenticator is a CDP feature: Chromium only.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm start:dev --port ${port} --strictPort`,
    url: baseURL,
    // Locally a dev server that is already up is the one to test against; CI starts its own.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
