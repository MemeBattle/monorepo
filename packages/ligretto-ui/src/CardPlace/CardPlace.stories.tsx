import React from 'react'
import { CardPlace } from './CardPlace'

export default {
  title: 'CardPlace',
}

export const DefaultView = () => (
  <div style={{ height: '400px', display: 'flex', alignItems: 'center', padding: '20px', justifyContent: 'space-around' }}>
    <CardPlace />
    <CardPlace />
    <CardPlace />
  </div>
)
