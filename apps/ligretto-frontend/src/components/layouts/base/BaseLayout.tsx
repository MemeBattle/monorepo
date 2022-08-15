import React from 'react'
import clsx from 'clsx'

import styles from './BaseLayout.module.scss'

interface Props {
  className?: string
}

export const BaseLayout: React.FC<Props> = ({ className, children }) => <main className={clsx(styles.screen, className)}>{children}</main>
