import React from 'react'
import renderer from 'react-test-renderer'

import { Menu } from '..'

describe('Menu', () => {
  it('should render correctly', () => {
    const component = renderer.create(<Menu />)
    const tree = component.toJSON()
    expect(tree).toMatchSnapshot()
  })
})
