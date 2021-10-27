import React from 'react'
import { Link } from './Link'

export default {
  title: 'Link',
  component: Link,
}

const Template = args => <Link {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  // write default values here
}
