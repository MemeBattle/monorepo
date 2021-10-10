import React from 'react'
import { LoaderCards } from './LoaderCards'
import { Background } from '../story-components'

export default {
  title: 'LoaderCards',
  component: LoaderCards,
}

const Template = args => (
  <Background>
    <LoaderCards {...args} />
  </Background>
)

export const DefaultView = Template.bind({})
DefaultView.args = {
  // write default values here
}
