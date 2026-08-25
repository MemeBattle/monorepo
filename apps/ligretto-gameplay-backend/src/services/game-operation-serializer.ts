import { injectable } from 'inversify'

@injectable()
export class GameOperationSerializer {
  private tails = new Map<string, Promise<void>>()

  async run<T>(gameId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(gameId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => (release = resolve))
    this.tails.set(gameId, current)

    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.tails.get(gameId) === current) {
        this.tails.delete(gameId)
      }
    }
  }
}
