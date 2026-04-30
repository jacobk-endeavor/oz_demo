/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_OPENAI_MODEL?: string
  /** Demo field rep first name (voice copy, dashboards, mock CRM rows). Default: Sami */
  readonly VITE_DEMO_REP_FIRST_NAME?: string
  /** Demo field rep last name; combined with first for full name. Default: Torres */
  readonly VITE_DEMO_REP_LAST_NAME?: string
  /** True when running under Vitest (see `isOpenAIConfigured`). */
  readonly VITEST?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
