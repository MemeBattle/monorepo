import { useEffect, useState } from 'react'

/**
 * Add a minimum time lag to loading for remove a screen flashing
 *
 * @param isLoading - real loading flag
 * @param ms - minimum time lag
 *
 * @returns fakedIsLoading
 */
export const useMinTimeLoading = (isLoading: boolean, ms: number): boolean => {
  const [isMinTimeOver, setIsMinTimeOver] = useState(false)

  useEffect(() => {
    const timerId = setTimeout(() => {
      setIsMinTimeOver(true)
    }, ms)

    return () => clearTimeout(timerId)
  }, [ms])

  return isLoading || !isMinTimeOver
}
