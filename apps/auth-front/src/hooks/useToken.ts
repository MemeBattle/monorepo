import { useLocation } from 'react-router'
import { useMemo } from 'react'

export const useToken = () => {
  const search = useLocation().search

  return useMemo(() => new URLSearchParams(search).get('token'), [search])
}
