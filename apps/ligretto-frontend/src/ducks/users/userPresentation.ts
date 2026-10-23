import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'

import type { User } from './usersTypes'

export const GUEST_LABEL = 'Guest'

/** The name a page shows: the account's own, or the app's label for a guest and for a full account that released none. */
export const userLabel = (user: Pick<User, 'accountType' | 'displayName'>) =>
  user.displayName ?? (user.accountType === 'guest' ? GUEST_LABEL : 'Player')

/** The picture: CAS's when it releases one, else the app's own by id, so CAS avatars appear with no frontend change. */
export const userAvatarUrl = (user: Pick<User, 'casId' | 'avatarUrl'>) => user.avatarUrl ?? getRandomAvatar(user.casId)
