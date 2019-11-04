import * as React from 'react'
import cn from 'classnames'
import styles from './PageHeader.module.scss'

export const PageHeader: React.FC<{ className?: string }> = ({ className, children }) => (
  <h1 className={cn(styles.pageHeader, className)}>{children}</h1>
)
