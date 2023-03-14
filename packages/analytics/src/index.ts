import amplitude from 'amplitude-js'
import type { AmplitudeClient } from 'amplitude-js'

export interface InitOptions {
  apiKey: string | undefined
}

export class Analytics {
  private amplitude?: AmplitudeClient
  public isInitialized = false

  constructor({ apiKey }: InitOptions) {
    if (apiKey) {
      this.amplitude = amplitude.getInstance()
      this.amplitude.init(apiKey)
      this.isInitialized = true
    }
  }

  public logEvent(event: string, eventProperties?: Record<string, unknown>) {
    if (!this.isInitialized) {
      return
    }
    this.amplitude?.logEvent(event, eventProperties)
  }

  public setUserProperties(userProperties: Record<string, unknown> & { id: string | null }) {
    if (!this.isInitialized) {
      return
    }
    if ('id' in userProperties) {
      this.amplitude?.setUserId(userProperties.id)
    }
    this.amplitude?.setUserProperties(userProperties)
  }

  public clearUserProperties() {
    if (!this.isInitialized) {
      return
    }
    this.amplitude?.clearUserProperties()
  }
}
