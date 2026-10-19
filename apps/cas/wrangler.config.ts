import { defineWranglerConfig } from 'wrangler/experimental-config'

export default defineWranglerConfig({
  build: {
    // Offline: the queries are checked against the committed .sqlx data,
    // never against whatever DATABASE_URL the shell happens to carry.
    command: 'SQLX_OFFLINE=true worker-build --release',
  },
  // Built beforehand (`pnpm cas:front:build`): Wrangler checks that this
  // directory exists before it runs the build command above.
  assetsDirectory: '../cas-frontend/dist',
})
