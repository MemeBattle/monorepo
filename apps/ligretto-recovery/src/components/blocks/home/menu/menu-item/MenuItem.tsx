import React from 'react'
import cn from 'classnames'
import { Link } from 'react-router-dom'

import type { routes } from 'utils/constants'

import styles from './MenuItem.module.scss'

type ValueOf<T> = T[keyof T]

export interface MenuItemProps {
  title: string
  to: ValueOf<typeof routes>
  disabled?: boolean
}

export const MenuItem: React.FC<MenuItemProps> = ({ title, to, disabled }) => (
  <li className={cn(styles.menuItem, { [styles.disabled]: disabled })}>
    <Link to={to}> {title} </Link>
  </li>
)
