import React from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'

import type { routes } from 'utils/constants'

import styles from './MenuItem.module.scss'

type ValueOf<T> = T[keyof T]

export interface MenuItemProps {
  title: string
  to: ValueOf<typeof routes>
  disabled?: boolean
  dataTestId: string
}

export const MenuItem: React.FC<MenuItemProps> = ({ title, to, disabled, dataTestId }) => (
  <li className={clsx(styles.menuItem, { [styles.disabled]: disabled })}>
    <Link to={to} data-test-id={dataTestId}>
      {title}
    </Link>
  </li>
)
