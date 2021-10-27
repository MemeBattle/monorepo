import { AppContext } from './context'
import { useContext } from 'react'

export const useAppContext = () => {
  const context = useContext(AppContext)

  return context
}
