import { Action as ReduxAction } from 'redux'

export interface Action<Type, Payload = undefined> extends ReduxAction<Type> {
  payload: Payload
}

export interface ErrorPayload {
  error: any
}

export type ErrorAction<Type> = Action<Type, ErrorPayload>

export type AnyAction = Action<any, any>
