import React from 'react'

import styles from './HomePageWrapper.module.scss'

export const HomePageWrapper: React.FC = ({ children }) => <div className={styles.wrapper}>{children}</div>
