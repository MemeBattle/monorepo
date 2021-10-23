import React from 'react'
import classNames from 'classnames'
import styles from './BaseLayout.module.scss'

interface Props {
  className?: string
}

export const BaseLayout: React.FC<Props> = ({ className, children }) => <main className={classNames(styles.screen, className)}>{children}</main>
