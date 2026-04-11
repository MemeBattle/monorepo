import type { Decorator, Preview } from '@storybook/react'
import { MINIMAL_VIEWPORTS } from 'storybook/viewport'
import { CssBaseline } from '@memebattle/ui'
import { ThemeProvider } from '@mui/material/styles'

import { theme } from '../apps/ligretto-frontend/src/app/themes/default'
import { ligrettoAuthTheme } from '../apps/ligretto-frontend/src/app/themes/ligrettoAuth'
import { gamehubClientTheme } from '../apps/gamehub-client/src/themes/gamehubClient'

const themesByNames: Record<string, object> = {
  ligretto: theme,
  ligrettoAuth: ligrettoAuthTheme,
  gameHub: gamehubClientTheme,
}

const getTheme = (themeName: string) => themesByNames[themeName] ?? theme

const withThemeProvider: Decorator = (Story, context) => {
  const currentTheme = getTheme(context.globals['theme'] as string)

  return (
    <ThemeProvider theme={currentTheme}>
      <CssBaseline />
      <Story />
    </ThemeProvider>
  )
}

const preview: Preview = {
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme for components',
      defaultValue: 'ligretto',
      toolbar: {
        icon: 'circlehollow',
        items: Object.keys(themesByNames),
        showName: true,
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    viewport: {
      viewports: MINIMAL_VIEWPORTS,
    },
    layout: 'fullscreen',
  },
  decorators: [withThemeProvider],
}

export default preview
