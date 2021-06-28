import React from 'react'
import { Snackbar } from './Snackbar'

export default {
  component: Snackbar,
  title: 'Snackbar',
}

const Template = args => <Snackbar {...args} />

export const Default = Template.bind({})
