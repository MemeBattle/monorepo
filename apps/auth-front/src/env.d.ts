/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CAS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
