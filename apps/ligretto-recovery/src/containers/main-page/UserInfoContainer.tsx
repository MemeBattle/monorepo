import React, { useCallback, useMemo } from 'react'
import { UserInfo } from 'components/blocks/home/user-info'
import { useHistory } from 'react-router'
import { routes } from 'utils/constants/router-constants'
import { useSelector } from 'react-redux'
import { selectCurrentUser } from '../../ducks/auth/authSelectors'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

export const UserInfoContainer = () => {
  const { push } = useHistory()

  const user = useSelector(selectCurrentUser)

  const onButtonClick = useCallback(() => {
    if (!user || user.isTemporary) {
      push(routes.AUTH)
    }
  }, [push, user])

  const userAvatarUrl = useMemo(() => {
    if (!user || user.isTemporary || !user.avatar) {
      return undefined
    }
    return buildCasStaticUrl(user.avatar)
  }, [user])

  return <UserInfo buttonText="sign in" img={userAvatarUrl} username={user?.isTemporary ? undefined : user?.username} onButtonClick={onButtonClick} onClick={onButtonClick} />
}
