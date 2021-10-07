import React from 'react'
import { LigrettoLogo } from './LigrettoLogo'
import { Background } from '../story-components'

export default {
  title: 'LigrettoLogo',
  component: LigrettoLogo,
}

const Template = args => (
  <Background>
    <LigrettoLogo {...args} />
  </Background>
)

export const DefaultView = Template.bind({})
DefaultView.args = {
  // write default values here
}
