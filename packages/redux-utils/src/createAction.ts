interface ReduxAction<T extends string> {
  type: T
}

export interface Action<Type extends string, Payload = void> extends ReduxAction<Type> {
  payload: Payload
}

type StingTypeField = {
  type: string
}

export type LookupStringTypeField<T, K> = K extends keyof T ? (T extends StingTypeField ? T[K] : never) : never

export interface ErrorPayload {
  error: unknown
}

export type ErrorAction<Type extends string> = Action<Type, ErrorPayload>

export const createAction = <A extends Action<LookupStringTypeField<A, 'type'>, A['payload']>>(type: A['type']) => (payload: A['payload']) => ({
  type,
  payload,
})
