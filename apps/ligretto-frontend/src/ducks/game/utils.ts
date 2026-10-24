import type { Player as SharedPlayer } from '@memebattle/ligretto-shared'

import type { User } from '../users/usersTypes'
import { userAvatarUrl, userLabel } from '../users/userPresentation'

export const mergePlayerAndUser = (player: SharedPlayer, user: User) =>
  ({
    status: player.status,
    isHost: player.isHost,
    username: userLabel(user),
    id: user.casId,
    avatar: userAvatarUrl(user),
    cards: player.cards,
    stackOpenDeck: player.stackOpenDeck,
  }) as const

export enum Hotkey {
  space = 'space',
  x = 'x',
  q = 'q',
  w = 'w',
  e = 'e',
  r = 'r',
  t = 't',
  l = 'l',
  escape = 'escape',
}
