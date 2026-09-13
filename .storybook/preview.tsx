import type { Decorator, Preview, StoryContext } from '@storybook/react'
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

// cas-frontend runs on Tailwind without MUI: its stories are told apart by
// path, get its stylesheet instead of the theme, and need nothing per file.
const isCasStory = (context: StoryContext) => String(context.parameters['fileName'] ?? '').includes('/apps/cas-frontend/')

const withThemeProvider: Decorator = (Story, context) => {
  if (isCasStory(context)) {
    return <Story />
  }
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
  loaders: [
    // Loaders run before a story renders, so the stylesheet is in place for
    // the first paint; the dynamic import keeps Tailwind's preflight away
    // from the MUI apps' stories.
    async context => {
      if (isCasStory(context)) {
        await import('../apps/cas-frontend/src/app/styles.css')
      }
    },
  ],
  decorators: [withThemeProvider],
}

export default preview
