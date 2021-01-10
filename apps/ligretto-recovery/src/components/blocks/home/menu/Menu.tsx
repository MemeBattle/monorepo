import React from 'react'

import { routes } from 'utils/constants'

import type { MenuItemProps } from './menu-item'
import { MenuItem } from './menu-item'

import styles from './Menu.module.scss'

const menuItems: MenuItemProps[] = [
  // TODO: add correct "to" for every item
  {
    title: 'Create game',
    to: routes.CREATE_ROOM,
  },
  {
    title: 'Enter room',
    to: routes.ROOMS,
  },
  {
    title: 'Leaders board',
    to: '/',
    disabled: true,
  },
  {
    title: 'Game rules',
    to: '/',
    disabled: true,
  },
  {
    title: 'News',
    to: '/',
    disabled: true,
  },
]

export const Menu = () => (
  <ul className={styles.menu}>
    {menuItems.map(item => (
      <MenuItem key={item.title} {...item} />
    ))}
  </ul>
)
