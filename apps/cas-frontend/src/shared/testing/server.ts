import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { recordUnhandledRequest } from './runtime'

// Initial handlers stay behind the entity handlers each test registers. An `onUnhandledRequest` callback cannot stop
// the request in MSW 2.15 (it passes through to the network once the callback returns), so this fallback answers it.
export const server = setupServer(
  http.all('*', ({ request }) => {
    recordUnhandledRequest(request)
    return HttpResponse.error()
  }),
)
