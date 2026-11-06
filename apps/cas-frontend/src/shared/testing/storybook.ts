import { http, HttpResponse, isCommonAssetRequest, passthrough } from 'msw'
import { setupWorker } from 'msw/browser'
import { fn } from 'storybook/test'
import { activateRuntime, consumeUnhandledRequests, deactivateRuntime, recordUnhandledRequest } from './runtime'

const clearDiagnostics = () => {
  consumeUnhandledRequests()
  document.querySelectorAll('[data-cas-mock-error]').forEach(element => element.remove())
}

/** Called by project beforeEach; Storybook owns ordering and invokes the returned cleanup. */
export const setupStoryMocks = async (isCas: boolean, signal: AbortSignal) => {
  if (!isCas || signal.aborted) {
    return
  }
  // Initial handlers stay behind the entity handlers registered by each story.
  const worker = setupWorker(
    http.all('*', ({ request }) => {
      const url = new URL(request.url)
      const api = url.pathname.startsWith('/api/')
      if (!api && (isCommonAssetRequest(request) || /iframe\.html|index\.json|sb-|@vite|@react-refresh|\/virtual:|\.stories\./.test(url.pathname))) {
        return passthrough()
      }
      recordUnhandledRequest(request)
      const message = `Unhandled CAS request: ${request.method} ${request.url}. Declare an entity testing helper.`
      const alert = document.createElement('div')
      alert.dataset['casMockError'] = ''
      alert.setAttribute('role', 'alert')
      alert.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;color:#900;padding:32px;font:16px monospace'
      alert.textContent = message
      document.body.append(alert)
      return HttpResponse.error()
    }),
  )
  const cleanup = () => {
    deactivateRuntime()
    worker.stop()
    clearDiagnostics()
  }
  try {
    await worker.start({
      quiet: true,
    })
    if (signal.aborted) {
      worker.stop()
      return
    }
    activateRuntime(worker, () => fn<(args: Record<string, unknown>) => unknown>())
    return cleanup
  } catch (error) {
    cleanup()
    throw error
  }
}
