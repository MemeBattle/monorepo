import React from 'react'
import type { UserInfoProps as UserInfoComponentProps } from '@memebattle/ligretto-ui'
import { UserInfo as UserInfoComponent } from '@memebattle/ligretto-ui'

import styles from './UserInfo.module.scss'

type UserInfoProps = UserInfoComponentProps

export const UserInfo: React.FC<UserInfoProps> = props => (
  <div className={styles.userInfo}>
    <UserInfoComponent {...props} />
  </div>
)
