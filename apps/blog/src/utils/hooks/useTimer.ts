import { useEffect, useRef, useCallback } from 'react'

interface TimerFunctions {
  startTimer: () => void
  stopTimer: () => void
}

/**
 * Generates a timer hook that allows the user to start and stop a timer.
 *
 * @param {() => void} callback - The callback function to be executed when the timer completes.
 * @param {number} delay - The delay in milliseconds before the timer executes the callback function. Default is 2000.
 * @return {TimerFunctions} - An object containing the startTimer and stopTimer functions, which can be used to start and stop the timer respectively.
 */
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
