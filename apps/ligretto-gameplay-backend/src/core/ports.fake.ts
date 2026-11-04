import type { AnyAction } from './actions'
import type { Connection } from './ports'

export class FakeConnection implements Connection {
  sent: AnyAction[] = []
  closedWith?: { code: number; reason: string }

  constructor(
    readonly roomId: string,
    readonly userId: string,
  ) {}

  send(action: AnyAction) {
    this.sent.push(action)
  }

  close(code: number, reason: string) {
    this.closedWith = { code, reason }
  }

  sentOfType(creator: { type: string }) {
    return this.sent.filter(action => action.type === creator.type)
  }
}
