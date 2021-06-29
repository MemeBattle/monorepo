import React, { useCallback } from 'react'
import { UserInfo } from 'components/blocks/home/user-info'
import { useHistory } from 'react-router'
import { routes } from 'utils/constants/router-constants'
import { useSelector } from 'react-redux'
import { selectMyUser } from '../../ducks/auth/authSelectors'

export const UserInfoContainer = () => {
  const { push } = useHistory()

  const user = useSelector(selectMyUser)

  const onButtonClick = useCallback(() => {
    push(routes.AUTH)
  }, [push])

  return <UserInfo buttonText="sign in" username={user?.username} onButtonClick={onButtonClick} onClick={onButtonClick} />
}
