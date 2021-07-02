import React, { useCallback, useMemo } from 'react'
import { UserInfo } from 'components/blocks/home/user-info'
import { useHistory } from 'react-router'
import { routes } from 'utils/constants/router-constants'
import { useSelector } from 'react-redux'
import { selectMyUser } from '../../ducks/auth/authSelectors'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

export const UserInfoContainer = () => {
  const { push } = useHistory()

  const user = useSelector(selectMyUser)

  const onButtonClick = useCallback(() => {
    if (!user?.username) {
      push(routes.AUTH)
    }
  }, [push, user])

  const userAvatarUrl = useMemo(() => {
    if (!user || !user.avatar) {
      return undefined
    }
    return buildCasStaticUrl(user.avatar)
  }, [user])

  return <UserInfo buttonText="sign in" img={userAvatarUrl} username={user?.username} onButtonClick={onButtonClick} onClick={onButtonClick} />
}
