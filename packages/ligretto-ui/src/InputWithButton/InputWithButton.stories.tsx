import React from 'react'
import { InputWithButton } from './InputWithButton'
import { InputWithButtonTypes } from '@memebattle/ligretto-shared'

export default {
  title: 'InputWithButton',
}

export const Search = () => <InputWithButton type={InputWithButtonTypes.search} />

export const CreateRoom = () => <InputWithButton type={InputWithButtonTypes.createRoom} />
