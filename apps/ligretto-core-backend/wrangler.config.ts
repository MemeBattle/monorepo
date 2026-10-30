import { defineWranglerConfig } from 'wrangler/experimental-config'

export default defineWranglerConfig({
  // Built beforehand by `pnpm build:worker`: Wrangler checks that this directory exists.
  assetsDirectory: '../ligretto-frontend/dist',
})
