import { useSelector } from 'react-redux'

import { currentUserSelector } from '#ducks/auth'
import { userAvatarUrl, userLabel } from '#ducks/users'
import { navigateToLogout, navigateToProfile, navigateToSignIn } from '#shared/api/authNavigation'

import { UserInfo } from './UserInfo'

export const UserInfoContainer = () => {
  const user = useSelector(currentUserSelector)

  const isGuest = !user || user.accountType === 'guest'

  const onButtonClick = isGuest ? navigateToSignIn : navigateToProfile

  return (
    <UserInfo
      img={user ? userAvatarUrl(user) : undefined}
      displayName={user ? userLabel(user) : undefined}
      isGuest={isGuest}
      onButtonClick={onButtonClick}
      onClick={onButtonClick}
      onLogoutClick={navigateToLogout}
    />
  )
}
