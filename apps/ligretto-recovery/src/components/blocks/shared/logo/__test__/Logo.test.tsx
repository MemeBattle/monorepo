import React from 'react'
import renderer from 'react-test-renderer'

import { Logo } from '../'

describe('Logo', () => {
  it('should render correctly', () => {
    const component = renderer.create(<Logo />)
    const tree = component.toJSON()
    expect(tree).toMatchSnapshot()
  })
})
