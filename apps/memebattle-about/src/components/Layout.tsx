import React from 'react'
import { Link } from '🏠/components/base'

const Layout: React.FC = ({ children }) => (
  <>
    <div>Zhopa konya</div>
    <Link href="/about">About t1</Link>
    {children}
  </>
)

export default Layout
