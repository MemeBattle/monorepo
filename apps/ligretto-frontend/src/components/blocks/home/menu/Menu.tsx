import React from 'react'

import { routes } from 'utils/constants'

import type { MenuItemProps } from './menu-item'
import { MenuItem } from './menu-item'
import styles from './Menu.module.scss'

const menuItems: MenuItemProps[] = [
  // TODO: add correct "to" for every item
  {
    title: 'Create / enter room',
    to: routes.ROOMS,
    dataTestId: 'Menu-MenuItem-CreateOrEnterRoom',
  },
  {
    title: 'Leaders board',
    to: '/',
    disabled: true,
    dataTestId: 'Menu-MenuItem-LeadersBoard',
  },
  {
    title: 'Game rules',
    to: '/',
    disabled: true,
    dataTestId: 'Menu-MenuItem-GameRules',
  },
  {
    title: 'News',
    to: '/',
    disabled: true,
    dataTestId: 'Menu-MenuItem-News',
  },
]

export const Menu = () => (
  <ul className={styles.menu}>
    {menuItems.map(item => (
      <MenuItem key={item.title} {...item} />
    ))}
  </ul>
)
