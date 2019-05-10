import { useContext } from 'react'
import { StoreContext } from 'contexts'
import { IStore } from 'stores'

export type UseStore = (selector: (store: IStore) => any) => any

export const useStore: UseStore = (selector = (store: IStore) => store) => {
  const appStore: IStore = useContext(StoreContext) as IStore
  return selector(appStore)
}
