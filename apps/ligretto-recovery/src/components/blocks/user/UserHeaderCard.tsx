import React from 'react'
import styles from './User.module.scss'

interface Props {
  username: string
  avatar: string
}

const UserHeaderCard: React.FC<Props> = ({ username, avatar }) => (
  <div className={styles.userHeaderCard}>
    <img className={styles.avatar} src={avatar} alt="avatar" />
    <p className={styles.username}>{username}</p>
  </div>
)

export default UserHeaderCard
