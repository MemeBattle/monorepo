import { isCommonAssetRequest } from 'msw'
import { setupWorker } from 'msw/browser'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { fn } from 'storybook/test'
import type { StoryContext } from '@storybook/react'
import { activateRuntime, consumeUnhandledRequests, deactivateRuntime, recordUnhandledRequest } from './runtime'

let worker: ReturnType<typeof setupWorker> | undefined
let running = false
let transition = Promise.resolve()
const addonLoader = mswLoader(() => {
  if (!worker) {
    throw new Error('CAS worker has not started')
  }
  return worker
})

const removeFailure = () => document.querySelectorAll('[data-cas-mock-error]').forEach(element => element.remove())

/** One awaited loader owns startup, addon reset, and domain registration, in that order. */
export const prepareStory = (isCas: boolean, scenario?: () => void) => {
  const next = transition.then(async () => {
    // The previous story already displayed its errors; they must not leak into the next scenario.
    consumeUnhandledRequests()
    removeFailure()
    deactivateRuntime()
    if (!isCas) {
      worker?.stop()
      running = false
      return
    }
    worker ??= setupWorker()
    if (!running) {
      await worker.start({
        quiet: true,
        onUnhandledRequest(request, print) {
          const url = new URL(request.url)
          const api = url.pathname.startsWith('/api/')
          if (
            !api &&
            (isCommonAssetRequest(request) || /iframe\.html|index\.json|sb-|@vite|@react-refresh|\/virtual:|\.stories\./.test(url.pathname))
          ) {
            return
          }
          recordUnhandledRequest(request)
          const message = `Unhandled CAS request: ${request.method} ${request.url}. Declare an entity testing helper.`
          const alert = document.createElement('div')
          alert.dataset['casMockError'] = ''
          alert.setAttribute('role', 'alert')
          alert.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;color:#900;padding:32px;font:16px monospace'
          alert.textContent = message
          document.body.append(alert)
          print.error()
        },
      })
      running = true
    }
    await addonLoader({ parameters: {} } as StoryContext)
    activateRuntime(worker, () => fn<(args: Record<string, unknown>) => unknown>())
    scenario?.()
  })
  // A bad scenario must not prevent a later selection from getting a fresh runtime.
  transition = next.catch(() => {})
  return next
}
