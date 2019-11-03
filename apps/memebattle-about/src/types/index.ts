import { NextContext } from 'next'
import React from 'react'
import { Store } from '🏠/stores'

export interface NextContextWithStore extends NextContext {
  store: Store
}

export interface ENFC<P = {}> extends React.FC<P> {
  getInitialProps: (ctx: NextContextWithStore) => any
}
