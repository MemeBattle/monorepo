'use client'
import { useEffect } from 'react'
import { AMPLITUDE_API_KEY } from '../../config'

export function Amplitude() {
  useEffect(() => {
    const initAmplitude = async () => {
      if (!AMPLITUDE_API_KEY) {
        return
      }
      const amplitude = await import('@amplitude/analytics-browser')

      amplitude.init(AMPLITUDE_API_KEY, undefined, {
        serverUrl: '/amplitude',
        logLevel: amplitude.Types.LogLevel.Warn,
      })
    }
    initAmplitude()
  })

  return null
}
