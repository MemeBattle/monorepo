import React from 'react'
import { PageHeader } from './PageHeader'
import { Background } from '../story-components'

export default {
  title: 'PageHeader',
}

export const DefaultView = () => (
  <Background>
    <PageHeader>Create new room</PageHeader>
  </Background>
)
