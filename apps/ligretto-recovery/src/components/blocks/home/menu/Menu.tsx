import React from 'react'

import { routes } from 'utils/constants'

import { MenuItem } from './menu-item'

import styles from './Menu.module.scss'

const menuItems = [
  // TODO: add correct "to" for every item
  {
    title: 'Create game',
    to: routes.NEW_ROOM,
  },
  {
    title: 'Enter room',
    to: routes.ROOMS,
  },
  {
    title: 'Leaders board',
    to: '/',
  },
  {
    title: 'Game rules',
    to: '/',
  },
  {
    title: 'News',
    to: '/',
  },
]

const Menu = () => (
  <ul className={styles.menu}>
    {menuItems.map(item => (
      <MenuItem key={item.title} {...item} />
    ))}
  </ul>
)

export default Menu
