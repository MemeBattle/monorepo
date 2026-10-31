import { defineWranglerConfig } from 'wrangler/experimental-config'

export default defineWranglerConfig({
  // Built beforehand by `pnpm build:worker` (`vite build`): Wrangler checks that this directory exists.
  assetsDirectory: './dist',
})
