import { defineConfig } from '@rslib/core'

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: ['node 18'],
      dts: true,
      bundle: false,
      autoExternal: false,
    },
    {
      format: 'cjs',
      syntax: ['node 18'],
      bundle: false,
      autoExternal: false,
    },
  ],
})
