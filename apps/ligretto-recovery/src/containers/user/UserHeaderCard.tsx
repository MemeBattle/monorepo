import React from 'react'
import { useSelector } from 'react-redux'
import { selectUserProfile } from 'ducks/user/selectors'
import { UserHeaderCard } from 'components/shared/user'

export const UserHeaderCardContainer: React.FC = () => {
  const { username, avatar } = useSelector(selectUserProfile)

  return <UserHeaderCard username={username} avatar={avatar} />
}
