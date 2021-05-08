import React from 'react'
import styles from './DropBox.module.scss'
import { ReactComponent as DropLogo } from '../../images/DropImage.svg'
import { Typography } from '@memebattle/ligretto-ui'

export const DropBox = () => (
  <div className={styles.box}>
    <DropLogo className={styles.box__logo} />
    <Typography variant="subtitle1" align={'center'} gutterBottom color={'inherit'}>
      Drop avatar here
    </Typography>
  </div>
)
