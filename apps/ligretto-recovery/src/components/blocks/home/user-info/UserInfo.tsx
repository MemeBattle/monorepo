import React from 'react'

import userAvatar from 'assets/icons/avatars/1.svg' // TODO: get avatars from avatar collection

import { Avatar } from 'components/blocks/shared/avatar'

import { UsernameField } from './username-field'

const UserInfo = () => (
  <section>
    <Avatar src={userAvatar} />
    <UsernameField />
  </section>
)

export default UserInfo
