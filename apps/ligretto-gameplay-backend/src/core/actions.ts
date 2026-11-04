export interface AnyAction {
  type: string
  payload?: unknown
}

export type Handler<C, R = unknown> = (ctx: C, action: AnyAction) => R
export type Handlers<C, R = unknown> = Record<string, Handler<C, R>>

/** Clients send anything, so the payload's shape is only as trusted as each handler's own checks. */
export const on =
  <C, P, R>(_creator: ((payload: P) => unknown) & { type: string }, handle: (ctx: C, payload: P) => R): Handler<C, R> =>
  (ctx, action) =>
    handle(ctx, action.payload as P)

export const dispatch = <C, R>(handlers: Handlers<C, R>, ctx: C, action: AnyAction): R | undefined =>
  Object.hasOwn(handlers, action.type) ? handlers[action.type](ctx, action) : undefined

export const parseAction = (raw: string | ArrayBuffer): AnyAction | undefined => {
  if (typeof raw !== 'string') {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && 'type' in parsed && typeof parsed.type === 'string') {
      return parsed as AnyAction
    }
  } catch {
    // Reported below, like any other message that is not an action.
  }
  console.error('A message should be an action with a type')
  return undefined
}
