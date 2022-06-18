import { useLocation } from 'react-router'
import { useMemo } from 'react'
import { LOCAL_STORAGE_TOKEN_KEY } from '@memebattle/ligretto-frontend/src/ducks/auth/constants'

export const useToken = () => {
  const search = useLocation().search

  return useMemo(() => new URLSearchParams(search).get('token') || window.localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY), [search])
}
