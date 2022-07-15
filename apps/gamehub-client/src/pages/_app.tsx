import { ThemeProvider, gamehubClientTheme } from '@memebattle/ui'
import type { AppProps as NextAppProps } from 'next/app'
import Head from 'next/head'

import type { EmotionCache } from '@emotion/react'
import { CacheProvider } from '@emotion/react'
import { createEmotionCache } from '../utils/createEmotionCache'

interface AppProps extends NextAppProps {
  emotionCache?: EmotionCache
}

// Client-side cache, shared for the whole session of the user in the browser.
const clientSideEmotionCache = createEmotionCache()

function App({ Component, pageProps, emotionCache = clientSideEmotionCache }: AppProps) {
  return (
    <CacheProvider value={emotionCache}>
      <Head>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
      </Head>
      <ThemeProvider theme={gamehubClientTheme}>
        <Component {...pageProps} />
      </ThemeProvider>
    </CacheProvider>
  )
}

export default App
