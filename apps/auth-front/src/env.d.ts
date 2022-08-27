/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly CAS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
