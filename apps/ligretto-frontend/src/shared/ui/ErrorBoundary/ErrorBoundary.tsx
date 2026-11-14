import { Component } from 'react'
import type { ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** A change clears an error that was already shown, as `resetKeys` in `react-error-boundary`. */
  resetKey?: unknown
  onReset?: () => void
  fallback: (props: { error: unknown; reset: () => void }) => ReactNode
}

type ErrorBoundaryState = { failed: false } | { failed: true; error: unknown }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failed: true, error }
  }

  /*
   * The boundary is not keyed by `resetKey`, because a remount would also remount the children and drop what a
   * transition keeps on screen. A key change clears only an error shown before the change. An error thrown by the
   * render that brought the new key belongs to that key and stays until the user acts.
   */
  componentDidUpdate(prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState) {
    if (prevState.failed && this.state.failed && !Object.is(prevProps.resetKey, this.props.resetKey)) {
      this.reset()
    }
  }

  reset = () => {
    this.props.onReset?.()
    this.setState({ failed: false })
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback({ error: this.state.error, reset: this.reset })
    }
    return this.props.children
  }
}
