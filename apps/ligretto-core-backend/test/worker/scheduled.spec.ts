// The cron handler under workerd. Like the rest of this suite it proves the wiring (the sweep use case on the two
// Hyperdrive bindings, inside a request scope), not behaviour, which src/core/sweep.spec.ts and the store suite cover.
import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

/**
 * The Worker's own default export. `Fetcher` of the Workers types does not declare `scheduled`, and the test pool calls
 * the handler directly: a failed sweep rejects here, where the runtime would report the outcome `exception`.
 */
const worker = (exports as unknown as { default: { scheduled(options: { cron: string }): Promise<void> } }).default

describe('the scheduled handler', () => {
  it('runs the sweep to completion', async () => {
    await expect(worker.scheduled({ cron: '7 * * * *' })).resolves.toBeUndefined()
  })

  it('runs again, on clients of its own: the first run closed its scope', async () => {
    await expect(worker.scheduled({ cron: '7 * * * *' })).resolves.toBeUndefined()
  })
})
