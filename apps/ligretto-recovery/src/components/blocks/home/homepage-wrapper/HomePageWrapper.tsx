import React from 'react'
import styles from './HomePageWrapper.module.scss'

const HomePageWrapper: React.FC = ({ children }) => <div className={styles.wrapper}>{children}</div>

export default HomePageWrapper
