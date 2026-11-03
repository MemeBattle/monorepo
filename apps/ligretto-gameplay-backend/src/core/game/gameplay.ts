import type { Game as GameState, UUID } from '@memebattle/ligretto-shared'
import { GameStatus, updateGameAction } from '@memebattle/ligretto-shared'
import type { AnyAction } from '../actions'
import { canMutateGameplay, putCard, putCardFromStackOpenDeck, takeFromLigrettoDeck, takeFromStackDeck } from './model/gameplay'
import { beginStarting, canResumeRound, canStartRound, closeRound, dealRound, isRoundInProgress, resumeRound, scoreRound } from './model/room'
import type { RoundToSave } from '../ports'

interface GameplayOptions {
  getState(): GameState
  save(next: GameState): void
  broadcast(action: AnyAction): void
}

/** The rounds of one game. The state belongs to `Room`, which creates this. */
export class Gameplay {
  private readonly getState: GameplayOptions['getState']
  private readonly save: GameplayOptions['save']
  private readonly broadcast: GameplayOptions['broadcast']

  private countdown?: ReturnType<typeof setTimeout>

  constructor({ getState, save, broadcast }: GameplayOptions) {
    this.getState = getState
    this.save = save
    this.broadcast = broadcast
  }

  /** The deal is saved at once and stays hidden until the countdown ends. */
  startRound(userId: UUID) {
    const state = this.getState()
    if (!canStartRound(state, userId)) {
      return
    }
    const starting = beginStarting(state)
    this.save(dealRound(starting))
    this.broadcast(updateGameAction(starting))
    this.startCountdown(state.config.startingDelayInSec)
  }

  resumeRound(userId: UUID) {
    if (canResumeRound(this.getState(), userId)) {
      this.show(resumeRound(this.getState()))
    }
  }

  /** A refused placement is shown too: the client mirrors its own placements optimistically, so it needs the state. */
  putCard(userId: UUID, cardIndex: number, playgroundDeckIndex: number) {
    if (canMutateGameplay(this.getState(), userId)) {
      this.show(putCard(this.getState(), userId, cardIndex, playgroundDeckIndex))
    }
  }

  putCardFromStack(userId: UUID, playgroundDeckIndex: number) {
    if (canMutateGameplay(this.getState(), userId)) {
      this.show(putCardFromStackOpenDeck(this.getState(), userId, playgroundDeckIndex))
    }
  }

  takeFromStack(userId: UUID) {
    if (canMutateGameplay(this.getState(), userId)) {
      this.show(takeFromStackDeck(this.getState(), userId))
    }
  }

  takeFromLigretto(userId: UUID) {
    if (!canMutateGameplay(this.getState(), userId)) {
      return undefined
    }
    const { game, remaining } = takeFromLigrettoDeck(this.getState(), userId)
    if (remaining === 0) {
      return this.endRound(game)
    }
    this.show(game)
    return undefined
  }

  stop() {
    if (this.countdown !== undefined) {
      clearTimeout(this.countdown)
      this.countdown = undefined
    }
  }

  private startCountdown(countdownInSec: number) {
    this.stop()
    this.countdown = setTimeout(() => {
      this.countdown = undefined
      const state = this.getState()
      if (isRoundInProgress(state)) {
        this.broadcast(updateGameAction(state))
      }
    }, countdownInSec * 1_000)
  }

  private show(next: GameState) {
    this.save(next)
    this.broadcast(updateGameAction(next))
  }

  private endRound(last: GameState): RoundToSave {
    const results = scoreRound(last)
    this.show(closeRound({ ...last, status: GameStatus.RoundFinished }))
    // Minted once per round: the core records a round with a known id at most once.
    return { roundId: crypto.randomUUID(), results }
  }
}
