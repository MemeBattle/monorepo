import { useContext } from 'react'
import { StoreContext } from 'contexts'
import { Store } from 'stores'

export type UseStore = (selector: (store: Store) => any) => any

export const useStore: UseStore = (selector = (store: Store) => store) => {
  const appStore: Store = useContext(StoreContext) as Store
  return selector(appStore)
}
