import React from 'react'
import { UserInfo } from './UserInfo'
import { Background } from '../story-components'

export default {
  title: 'UserInfo',
  component: UserInfo,
  argTypes: {
    onClick: { action: 'clicked' },
    buttonText: { control: 'text', defaultValue: 'sign in' },
    onButtonClick: { action: 'buttonClicked' },
  },
}

export const DefaultView = args => (
  <Background>
    <UserInfo {...args} />
  </Background>
)

export const Authorized = args => (
  <Background>
    <UserInfo {...args} />
  </Background>
)

Authorized.argTypes = {
  onClick: { action: 'clicked' },
  username: { control: 'text', defaultValue: 'themezv' },
  buttonText: { control: 'text', defaultValue: 'sign in' },
  onButtonClick: { action: 'button clicked' },
}
