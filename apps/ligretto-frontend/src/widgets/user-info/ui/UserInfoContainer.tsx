import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router'
import { useCallback } from 'react'

import { authRoutes } from '#shared/constants'
import { currentUserSelector } from '#ducks/auth'
import { userAvatarUrl, userLabel } from '#ducks/users'
import { navigateToLogout, navigateToSignIn } from '#shared/api/authNavigation'

import { UserInfo } from './UserInfo'

export const UserInfoContainer = () => {
  const navigate = useNavigate()

  const user = useSelector(currentUserSelector)

  const isGuest = !user || user.accountType === 'guest'

  const onButtonClick = useCallback(() => {
    if (isGuest) {
      navigateToSignIn()
    } else {
      navigate(authRoutes.PROFILE)
    }
  }, [navigate, isGuest])

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
