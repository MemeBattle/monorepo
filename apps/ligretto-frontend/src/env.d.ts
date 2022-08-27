/// <reference types="vite/client" />

export {}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      LIGRETTO_CORE_URL: string
      LIGRETTO_GAMEPLAY_URL: string
      CAS_STATIC_URL: string
      CAS_URL: string
      AMPLITUDE_TOKEN?: string
      CAS_PARTNER_ID: string
    }
  }
}
