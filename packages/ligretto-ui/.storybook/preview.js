import React from 'react'
import { addDecorator } from '@storybook/react'
import { MINIMAL_VIEWPORTS } from '@storybook/addon-viewport'
import { ThemeProvider, StylesProvider } from '@material-ui/core/styles'
import CssBaseline from '@material-ui/core/CssBaseline'
import { theme } from '../src'

export const parameters = {
  viewport: {
    viewports: MINIMAL_VIEWPORTS,
  }
}

addDecorator(storyFn => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <StylesProvider injectFirst>{storyFn()}</StylesProvider>
  </ThemeProvider>
))
