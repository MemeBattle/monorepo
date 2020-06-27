import React from 'react'
import { addDecorator } from '@storybook/react'
import { withInfo } from '@storybook/addon-info'
import { ThemeProvider, StylesProvider } from '@material-ui/core/styles'
import { theme } from '../src'

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
    <StylesProvider injectFirst>{storyFn()}</StylesProvider>
  </ThemeProvider>
))
