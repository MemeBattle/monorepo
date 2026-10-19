import { defineWranglerConfig } from 'wrangler/experimental-config'

export default defineWranglerConfig({
  build: {
    // The SPA first, then the Worker. Offline: the queries are checked against
    // the committed .sqlx data, never against whatever DATABASE_URL the shell
    // happens to carry.
    command: 'pnpm --filter @memebattle/cas-frontend build && SQLX_OFFLINE=true worker-build --release',
  },
  assetsDirectory: '../cas-frontend/dist',
})
