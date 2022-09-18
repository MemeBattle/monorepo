import React from 'react'
import type { UserInfoProps as UserInfoComponentProps } from '@memebattle/ui'
import { UserInfo as UserInfoComponent } from '@memebattle/ui'

import { Avatar } from 'components/Avatar'

import styles from './UserInfo.module.scss'

type UserInfoProps = Omit<UserInfoComponentProps, 'children'>

export const UserInfo: React.FC<UserInfoProps> = props => (
  <div className={styles.userInfo}>
    <UserInfoComponent {...props}>
      <Avatar src={props.img} alt={props.username} size="auto" />
    </UserInfoComponent>
  </div>
)
