/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_OPENAI_MODEL?: string
  /** True when running under Vitest (see `isOpenAiConfigured`). */
  readonly VITEST?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
