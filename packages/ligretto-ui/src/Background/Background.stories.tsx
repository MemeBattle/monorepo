import React from 'react'
import { Background } from './Background'

export default {
  title: 'Background',
  component: Background,
}

const Template = args => <Background {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  // write default values here
}
