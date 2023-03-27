'use client'

import { CssBaseline, ThemeProvider } from '@memebattle/ui'
import type { ReactNode } from 'react'
import { useMemo } from 'react'

import { CacheProvider } from '@emotion/react'

import { useServerInsertedHTML } from 'next/navigation'

import { gamehubClientTheme } from '../themes/gamehubClient'
import { createEmotionCache } from '../utils/createEmotionCache'

export function EmotionCacheProvider({ children }: { children: ReactNode }) {
  const cache = useMemo(() => {
    const c = createEmotionCache()
    c.compat = true
    return c
  }, [])

  useServerInsertedHTML(() => (
    <style
      data-emotion={`${cache.key} ${Object.keys(cache.inserted).join(' ')}`}
      dangerouslySetInnerHTML={{
        __html: Object.values(cache.inserted).join(' '),
      }}
    />
  ))

  return <CacheProvider value={cache}>{children}</CacheProvider>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <EmotionCacheProvider>
      <ThemeProvider theme={gamehubClientTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </EmotionCacheProvider>
  )
}
