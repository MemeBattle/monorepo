interface ReduxAction<T extends string> {
  type: T
}

export interface Action<Type extends string, Payload = void> extends ReduxAction<Type> {
  payload: Payload
}

export type AnyAction = Action<any, any>

type StingTypeField = {
  type: string
}

export type LookupStringTypeField<T, K> = K extends keyof T ? (T extends StingTypeField ? T[K] : never) : never

export interface ErrorPayload {
  error: any
}

export type ErrorAction<Type extends string> = Action<Type, ErrorPayload>
