import { Action, LookupStringTypeField } from '../types/actions'

export const createAction = <A extends Action<LookupStringTypeField<A, 'type'>, A['payload']>>(type: A['type']) => (payload: A['payload']) => ({
  type,
  payload,
})
