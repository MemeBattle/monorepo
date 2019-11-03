import App, { Container } from 'next/app'
import * as React from 'react'
import { getSnapshot } from 'mobx-state-tree'
import { initializeStore, Store } from '🏠/stores'
import { StoreContext } from '🏠/contexts'
import { loadPolyfills } from '🏠/utils/loadPolyfills'
import '🏠/assets/css/global.scss'

class MyApp extends App {
  protected store: Store

  public static async getInitialProps({ Component, router, ctx }) {
    const store = initializeStore()

    ctx.store = store

    const pageProps = Component.getInitialProps ? await Component.getInitialProps(ctx) : {}

    return {
      initialState: getSnapshot(store),
      pageProps,
    }
  }

  constructor(props) {
    super(props)
    this.store = initializeStore(props.initialState) as Store
  }

  public render() {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <StoreContext.Provider value={this.store}>
          <Component {...pageProps} />
        </StoreContext.Provider>
      </Container>
    )
  }
}

if (typeof window !== 'undefined') {
  loadPolyfills()
}

export default MyApp
