import React from 'react'

import userAvatar from 'assets/icons/avatars/1.svg' // TODO: get avatar from avatars collection

import { Avatar } from 'components/blocks/shared/avatar'

export const AvatarSelect = () => (
  <div>
    <Avatar src={userAvatar} />
  </div>
)
