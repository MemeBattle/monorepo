---
to: packages/ligretto-ui/src/<%= h.changeCase.pascal(name) %>/<%= h.changeCase.pascal(name) %>.stories.tsx
---
import React from 'react'
import { <%= h.changeCase.pascal(name) %> } from './<%= h.changeCase.pascal(name) %>'

export default {
  title: 'Ligretto-ui / <%= h.changeCase.pascal(name) %>',
  component: <%= h.changeCase.pascal(name) %>
}

const Template = args => <<%= h.changeCase.pascal(name) %> {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  // write default values here
}
