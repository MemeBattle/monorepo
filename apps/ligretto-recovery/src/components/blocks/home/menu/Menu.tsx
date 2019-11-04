import React from 'react'

import { MenuItem } from './menu-item'

import styles from './Menu.module.scss'

const menuItems = [
  {
    title: 'Create game',
    to: '/',
  },
  {
    title: 'Enter room',
    to: '/',
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
