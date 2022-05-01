import React from 'react'
import { LigrettoLogo } from './LigrettoLogo'

export default {
  title: 'LigrettoLogo',
  component: LigrettoLogo,
}

const Template = args => <LigrettoLogo {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  // write default values here
}
