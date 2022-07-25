import type { UUID } from '@memebattle/ligretto-shared'

export interface User {
  id: UUID
  currentGameId?: UUID
  socketIds: string[]
}
