import React, { useCallback } from 'react'
import { UserInfo } from 'components/blocks/home/user-info'
import { useHistory } from 'react-router'
import { routes } from 'utils/constants/router-constants'

export const UserInfoContainer = () => {
  const { push } = useHistory()

  const onButtonClick = useCallback(() => {
    push(routes.AUTH)
  }, [])

  return <UserInfo buttonText="sign up" onButtonClick={onButtonClick} onClick={onButtonClick} />
}
