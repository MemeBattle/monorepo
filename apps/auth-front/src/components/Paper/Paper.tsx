import React, { FC, memo } from 'react'

import styles from './Paper.module.scss';

export const Paper: FC = memo(({ children }) => (
  <div className={styles.paper}>
    {children}
  </div>
))
