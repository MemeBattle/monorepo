import { useEffect, useRef, useCallback } from 'react'

interface TimerFunctions {
  startTimer: () => void
  stopTimer: () => void
}

export function useTimer(callback: () => void, delay = 2000): TimerFunctions {
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const startTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(callback, delay)
  }, [callback, delay])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => stopTimer, [stopTimer])

  return { startTimer, stopTimer }
}
