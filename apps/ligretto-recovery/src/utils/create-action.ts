import { AnyAction } from '../types/actions'

export const createAction = <ActionType extends AnyAction>(type: ActionType['type']) => (payload?: object) => ({
  type,
  payload,
})
