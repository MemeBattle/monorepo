import { describe, expect, it } from 'vitest'

describe('the contract entry', () => {
  it('has no runtime export, so a browser bundle that imports it pulls nothing in', async () => {
    // Types alone: zod and the schemas stay behind `import type`, which the transpiler erases.
    expect(Object.keys(await import('./contract'))).toEqual([])
  })
})
