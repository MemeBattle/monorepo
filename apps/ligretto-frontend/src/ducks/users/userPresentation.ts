import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'

import type { User } from './usersTypes'

export const GUEST_LABEL = 'Guest'

export const userLabel = (user: Pick<User, 'accountType' | 'name'>) => user.name ?? (user.accountType === 'guest' ? GUEST_LABEL : 'Player')

export const userAvatarUrl = (user: Pick<User, 'sub' | 'avatarUrl'>) => user.avatarUrl ?? getRandomAvatar(user.sub)
