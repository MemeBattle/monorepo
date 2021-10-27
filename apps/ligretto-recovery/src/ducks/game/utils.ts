import type { Player as SharedPlayer } from '@memebattle/ligretto-shared'
import type { User } from '../users/usersTypes'

export const mergePlayerAndUser = (player: SharedPlayer, user: User) =>
  ({
    status: player.status,
    isHost: player.isHost,
    username: user.isTemporary ? 'anon' : user.username,
    id: user.casId,
    avatar: user.isTemporary ? '' : user.avatar,
    cards: player.cards,
    stackOpenDeck: player.stackOpenDeck,
  } as const)
