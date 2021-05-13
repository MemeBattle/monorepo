import React from 'react'
import styles from './UserPhotoDrop.module.scss'

type UserPhotoDrop = {
  preview: string
  name: string
}
type UserPhotoDropProps = {
  file: UserPhotoDrop
}

export const UserPhotoDrop = ({ file }: UserPhotoDropProps) => (
  <div className={styles.userPhoto}>
    <img key={file.name} src={file.preview} className={styles.img} alt={file.name} />
  </div>
)
