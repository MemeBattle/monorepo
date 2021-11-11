import { useDispatch, useSelector } from 'react-redux'
import { useHistory } from 'react-router'
import React, { useCallback, useMemo } from 'react'
import { UserInfo } from 'components/blocks/home/user-info'
import { routes } from 'utils/constants'
import { getMeLogout, selectCurrentUser } from 'ducks/auth'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

export const UserInfoContainer = () => {
  const dispatch = useDispatch()

  const { push } = useHistory()

  const user = useSelector(selectCurrentUser)

  const onButtonClick = useCallback(() => {
    if (!user || user.isTemporary) {
      push(routes.AUTH)
    }
  }, [push, user])

  const logoutClick = useCallback(() => {
    dispatch(getMeLogout())
  }, [dispatch])

  const userAvatarUrl = useMemo(() => {
    if (!user || user.isTemporary || !user.avatar) {
      return undefined
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
      logoutClick={logoutClick}
    />
  )
}
