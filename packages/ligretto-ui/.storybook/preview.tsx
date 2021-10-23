import React from 'react'
import { addDecorator, Parameters } from '@storybook/react'
import { MINIMAL_VIEWPORTS } from '@storybook/addon-viewport'
import { ThemeProvider, StylesProvider } from '@material-ui/core/styles'
import CssBaseline from '@material-ui/core/CssBaseline'
import { theme } from '../src'

export const parameters: Parameters = {
  viewport: {
    viewports: MINIMAL_VIEWPORTS,
  },
  layout: 'fullscreen',
}

addDecorator(storyFn => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <StylesProvider injectFirst>{storyFn()}</StylesProvider>
  </ThemeProvider>
))
