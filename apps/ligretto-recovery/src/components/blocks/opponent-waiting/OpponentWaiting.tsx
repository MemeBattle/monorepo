import React from 'react'
import opponentAvatar from 'assets/icons/avatars/2.svg' // TODO: get avatar from avatars collection
import { Avatar } from '../shared/avatar'

export const OpponentWaiting = () => (
  <div>
    <Avatar src={opponentAvatar} />
  </div>
)
