import { request } from '#shared/api/request'

/** `GET /api/me`: the signed-in account as the dashboard needs it. */
export interface Me {
  accountId: string
  displayName: string
  accountType: 'full' | 'guest'
  email: string | null
  /** RFC 3339; when the session ends if nothing renews it. */
  sessionExpiresAt: string
}

/** Throws `ApiError` with the code `unauthenticated` when the browser holds no live session. */
export const getMe = () => request<Me>('/api/me')
