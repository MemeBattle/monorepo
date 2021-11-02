import React from 'react'
import { Paper } from './Paper'

export default {
  title: 'Paper',
  component: Paper,
}

const Template = args => <Paper {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  children: 'Qweqwe'
}
