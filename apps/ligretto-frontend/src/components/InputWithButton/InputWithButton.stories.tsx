import React from 'react'
import { InputWithButton } from './InputWithButton'
import { InputWithButtonTypes } from '@memebattle/ligretto-shared'

export default {
  title: 'Ligretto / InputWithButton',
}

export const Search = () => <InputWithButton type={InputWithButtonTypes.search} placeholder={'Search..'} />

export const CreateRoom = () => <InputWithButton type={InputWithButtonTypes.createRoom} placeholder={'Create room..'} />
