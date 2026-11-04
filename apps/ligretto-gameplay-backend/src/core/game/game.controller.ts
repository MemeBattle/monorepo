import type { UUID } from '@memebattle/ligretto-shared'
import {
  leaveFromRoomEmitAction,
  putCardAction,
  putCardFromStackOpenDeck,
  resumeGameEmitAction,
  setPlayerStatusEmitAction,
  startGameEmitAction,
  takeFromLigrettoDeckAction,
  takeFromStackDeckAction,
} from '@memebattle/ligretto-shared'
import type { AnyAction, Handlers } from '../actions'
import { dispatch, on } from '../actions'
import type { Room } from './room'
import type { RoundToSave } from '../ports'

/** One connection's view of its room. */
export interface GameControllerContext {
  room: Room
  userId: UUID
}

const handlers: Handlers<GameControllerContext, RoundToSave | void> = {
  [setPlayerStatusEmitAction.type]: on(setPlayerStatusEmitAction, (ctx: GameControllerContext, { status }) => {
    ctx.room.setReadiness(ctx.userId, status)
  }),

  [leaveFromRoomEmitAction.type]: on(leaveFromRoomEmitAction, ctx => {
    ctx.room.leave(ctx.userId)
  }),

  [startGameEmitAction.type]: on(startGameEmitAction, ctx => {
    ctx.room.gameplay.startRound(ctx.userId)
  }),

  [resumeGameEmitAction.type]: on(resumeGameEmitAction, ctx => {
    ctx.room.gameplay.resumeRound(ctx.userId)
  }),

  [putCardAction.type]: on(putCardAction, (ctx: GameControllerContext, { cardIndex, playgroundDeckIndex }) => {
    ctx.room.gameplay.putCard(ctx.userId, cardIndex, playgroundDeckIndex)
  }),

  [putCardFromStackOpenDeck.type]: on(putCardFromStackOpenDeck, (ctx: GameControllerContext, { playgroundDeckIndex }) => {
    ctx.room.gameplay.putCardFromStack(ctx.userId, playgroundDeckIndex)
  }),

  [takeFromStackDeckAction.type]: on(takeFromStackDeckAction, ctx => {
    ctx.room.gameplay.takeFromStack(ctx.userId)
  }),

  [takeFromLigrettoDeckAction.type]: on(takeFromLigrettoDeckAction, ctx => ctx.room.gameplay.takeFromLigretto(ctx.userId)),
}

export const handleAction = (ctx: GameControllerContext, action: AnyAction) => {
  // A client names its room in the payload; the connection is what decides, so another name is a stale message.
  const named = (action.payload as { gameId?: unknown } | undefined)?.gameId
  if (named !== undefined && named !== ctx.room.id) {
    return
  }
  try {
    return dispatch(handlers, ctx, action)
  } catch (error) {
    console.error('A message failed', { roomId: ctx.room.id, type: action.type, error })
  }
}
