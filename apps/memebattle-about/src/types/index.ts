import { NextContext } from 'next'
import React from 'react'
import { IStore } from '🏠/stores'

export interface NextContextWithStore extends NextContext {
  store: IStore
}

export interface ENFC<P = {}> extends React.FC<P> {
  getInitialProps: (ctx: NextContextWithStore) => any
}
