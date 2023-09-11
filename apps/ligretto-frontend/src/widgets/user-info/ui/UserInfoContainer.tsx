import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router'
import { useCallback, useMemo } from 'react'

import { authRoutes } from 'shared/constants'
import { logout, currentUserSelector } from 'ducks/auth'
import { buildCasStaticUrl } from 'shared/api/buildCasStaticUrl'
import { getRandomAvatar } from 'shared/ui/Avatar/getRandomAvatar'

import { UserInfo } from './UserInfo'

export const UserInfoContainer = () => {
  const dispatch = useDispatch()

  const navigate = useNavigate()

  const user = useSelector(currentUserSelector)

  const onButtonClick = useCallback(() => {
    if (!user || user.isTemporary) {
      navigate(authRoutes.LOGIN)
    } else {
      navigate(authRoutes.PROFILE)
    }
  }, [navigate, user])

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
      img={userAvatarUrl}
      username={user?.isTemporary ? undefined : user?.username}
      onButtonClick={onButtonClick}
      onClick={onButtonClick}
      onLogoutClick={logoutClick}
    />
  )
}
