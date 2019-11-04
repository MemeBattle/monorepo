import React from 'react'
import classNames from 'classnames'
import styles from './BaseScreen.module.scss'

interface Props {
  className?: string
}

export const BaseScreen: React.FC<Props> = ({ className, children }) => <main className={classNames(styles.screen, className)}>{children}</main>
