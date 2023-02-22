import React from 'react'
import styles from './UserPhotoDrop.module.scss'

type UserPhotoDropProps = {
  name: string
  src: string
}

export const UserPhotoDrop = ({ name, src }: UserPhotoDropProps) => (
  <div className={styles.userPhoto}>
    <img key={name} src={src} className={styles.img} alt={src} />
  </div>
)
