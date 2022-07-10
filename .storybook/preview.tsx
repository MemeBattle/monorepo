import { addDecorator, Parameters } from '@storybook/react'
import { MINIMAL_VIEWPORTS } from '@storybook/addon-viewport'
import { CssBaseline, theme, ligrettoAuthTheme, gamehubClientTheme } from '@memebattle/ui'
import { ThemeProvider } from '@mui/material/styles'

const themesByNames = {
  ligretto: theme,
  ligrettoAuth: ligrettoAuthTheme,
  gameHub: gamehubClientTheme
}

const getTheme = (themeName: string) => {
  return themesByNames[themeName] || theme
}

export const globalTypes = {
  theme: {
    name: 'Theme',
    description: 'Global theme for components',
    defaultValue: 'ligretto',
    toolbar: {
      icon: 'circlehollow',
      // Array of plain string values or MenuItem shape (see below)
      items: Object.keys(themesByNames),
      // Property that specifies if the name of the item will be displayed
      showName: true,
      // Change title based on selected value
      dynamicTitle: true,
    },
  },
};

export const parameters: Parameters = {
  viewport: {
    viewports: MINIMAL_VIEWPORTS,
  },
  layout: 'fullscreen',
}

const withThemeProvider = (Story,context) => {
  const currentTheme = getTheme(context.globals.theme);

  return (
    <ThemeProvider theme={currentTheme}>
      <CssBaseline />
      <Story {...context} />
    </ThemeProvider>
  )
}

export const decorators = [withThemeProvider]
