import React from 'react'
import styles from './DropBox.module.scss'
import dropIcon from '../../images/DropImage.svg'
import { Typography } from '@memebattle/ui'
import { t } from '../../utils/i18n'

export const DropBox = () => (
  <div className={styles.box}>
    <img src={dropIcon} className={styles.dropIcon} />
    <Typography variant="subtitle1" align="center" gutterBottom color="inherit">
      {t.dropBox.text}
    </Typography>
  </div>
)
