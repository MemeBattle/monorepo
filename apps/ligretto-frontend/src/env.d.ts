/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEBSOCKET_HOST: string
  readonly VITE_AMPLITUDE_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
