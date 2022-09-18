import { useDispatch, useSelector } from 'react-redux'
import { useHistory } from 'react-router'
import React, { useCallback, useMemo } from 'react'

import { UserInfo } from 'components/blocks/home/user-info'
import { authRoutes, routes } from 'utils/constants'
import { logout, currentUserSelector } from 'ducks/auth'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'

export const UserInfoContainer = () => {
  const dispatch = useDispatch()

  const { push } = useHistory()

  const user = useSelector(currentUserSelector)

  const onButtonClick = useCallback(() => {
    if (!user || user.isTemporary) {
      push(routes.AUTH)
    } else {
      push(authRoutes.PROFILE)
    }
  }, [push, user])

  const logoutClick = useCallback(() => {
    dispatch(logout())
  }, [dispatch])

  const userAvatarUrl = useMemo(() => {
    if (!user) {
      return undefined
    }
    if (user.isTemporary || !user.avatar) {
      return getRandomAvatar(user.casId)
    }
    return buildCasStaticUrl(user.avatar)
  }, [user])

  return (
    <UserInfo
      buttonText="Sign in"
      img={userAvatarUrl}
      username={user?.isTemporary ? undefined : user?.username}
      onButtonClick={onButtonClick}
      onClick={onButtonClick}
      onLogoutClick={logoutClick}
    />
  )
}
