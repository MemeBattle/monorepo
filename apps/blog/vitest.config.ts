import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import path from 'node:path'

import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'

const ENV_VARIABLES_SHARED_TO_TESTS = ['APP_HOST_URL']

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, './'), '')
  const envVariables = ENV_VARIABLES_SHARED_TO_TESTS.reduce(
    (exposed, variable) => ({ ...exposed, [`process.env.${variable}`]: JSON.stringify(env[variable]) }),
    {},
  )

  return {
    plugins: [
      mdx({
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: 'wrap',
              properties: {
                className: ['no-underline hover:underline font-bold text-inherit'],
              },
            },
          ],
        ],
      }),
      react(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: envVariables,
    test: {
      globals: true,
      environment: 'jsdom',
    },
  }
})
