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
  <main className={styles.menu}>
    <ul>
      {menuItems.map(item => (
        <MenuItem {...item} />
      ))}
    </ul>
  </main>
)

export default Menu
