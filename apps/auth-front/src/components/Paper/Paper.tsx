import React, { memo } from 'react'
import { Paper as UIPaper } from '@memebattle/ligretto-ui'

import styles from './Paper.module.scss'

export const Paper = memo(({ children }) => (
  <UIPaper>
    <div className={styles.paper}>{children}</div>
  </UIPaper>
))
