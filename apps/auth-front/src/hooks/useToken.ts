import { useLocation } from 'react-router'
import { useMemo } from 'react'
import { useAppContext } from '../modules/app'

export const useToken = () => {
  const search = useLocation().search

  const appContext = useAppContext()

  return useMemo(() => new URLSearchParams(search).get('token') || appContext.token, [appContext.token, search])
}
