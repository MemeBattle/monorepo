import React from 'react'
import { addDecorator } from '@storybook/react'
import { withInfo } from '@storybook/addon-info'
import { MINIMAL_VIEWPORTS } from '@storybook/addon-viewport'
import { ThemeProvider, StylesProvider } from '@material-ui/core/styles'
import CssBaseline from '@material-ui/core/CssBaseline'
import { theme } from '../src'

export const parameters = {
  viewport: {
    viewports: MINIMAL_VIEWPORTS,
  }
}

addDecorator(
  withInfo({
    styles: {
      header: {
        h1: {
          marginRight: '20px',
          fontSize: '25px',
          display: 'inline',
        },
        body: {
          paddingTop: 0,
          paddingBottom: 0,
        },
        h2: {
          display: 'inline',
          color: '#999',
        },
      },
      infoBody: {
        backgroundColor: '#eee',
        padding: '0px 5px',
        lineHeight: '2',
      },
    },
    inline: true,
    source: true,
  }),
)

addDecorator(storyFn => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <StylesProvider injectFirst>{storyFn()}</StylesProvider>
  </ThemeProvider>
))
