import { addDecorator, Parameters } from '@storybook/react'
import { MINIMAL_VIEWPORTS } from '@storybook/addon-viewport'
import { CssBaseline, theme } from '@memebattle/ligretto-ui'
import { ThemeProvider } from '@mui/material/styles'

export const parameters: Parameters = {
  viewport: {
    viewports: MINIMAL_VIEWPORTS,
  },
  layout: 'fullscreen',
}

addDecorator(storyFn => (
  <ThemeProvider theme={theme}>
    <CssBaseline />{storyFn()}
  </ThemeProvider>
))
