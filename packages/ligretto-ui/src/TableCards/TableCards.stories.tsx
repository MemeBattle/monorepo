import React from 'react'
import { TableCards } from './TableCards'
import {CardPlace} from '../CardPlace'

import {Background} from '../story-components/Background'

export default {
  title: 'TableCards',
}


export const DefaultView = () => <Background padding="2rem"><TableCards>{
  Array(10).fill(1).map(() => <CardPlace />)
}</TableCards></Background>
