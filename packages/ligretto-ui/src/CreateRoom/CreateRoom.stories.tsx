import React from 'react'
import { CreateRoom } from './CreateRoom'
import {Background} from '../story-components'


export default {
  title: 'CreateRoom',
}

export const DefaultView = () => <Background padding="2rem"><CreateRoom /></Background>
