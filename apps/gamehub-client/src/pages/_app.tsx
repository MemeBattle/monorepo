import { ThemeProvider, CssBaseline } from '@memebattle/ui'
import type { AppProps as NextAppProps } from 'next/app'
import Head from 'next/head'

import type { ReactNode } from 'react'

import type { EmotionCache } from '@emotion/react'
import { CacheProvider } from '@emotion/react'
import { createEmotionCache } from '../utils/createEmotionCache'

import { gamehubClientTheme } from '../themes/gamehubClient'

import type { NextPageWithLayout } from '../types'

interface AppProps extends NextAppProps {
  emotionCache?: EmotionCache
  Component: NextPageWithLayout
}

// Client-side cache, shared for the whole session of the user in the browser.
const clientSideEmotionCache = createEmotionCache()

const defaultGetLayout = (page: ReactNode) => page

function App({ Component, pageProps, emotionCache = clientSideEmotionCache }: AppProps) {
  const getLayout = Component.getLayout ?? defaultGetLayout

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={gamehubClientTheme}>
        <CssBaseline />
        {getLayout(
          <>
            <Head>
              <meta name="viewport" content="initial-scale=1, width=device-width" />
            </Head>

            <Component {...pageProps} />
          </>,
        )}
      </ThemeProvider>
    </CacheProvider>
  )
}

export default App
