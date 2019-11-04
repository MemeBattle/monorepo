import React from 'react'
import { Link } from 'react-router-dom'

import { routes } from 'utils/constants'

type ValueOf<T> = T[keyof T]

interface MenuItem {
  title: string
  to: ValueOf<typeof routes>
}

const MenuItem: React.FC<MenuItem> = ({ title, to }) => (
  <li>
    <Link to={to}> {title} </Link>
  </li>
)

export default MenuItem
