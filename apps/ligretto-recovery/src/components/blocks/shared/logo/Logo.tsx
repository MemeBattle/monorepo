import React from 'react'

import styles from './Logo.module.scss'

const Logo: React.FC = ({ children }) => <h1 className={styles.logo}>{children}</h1>

export default Logo
