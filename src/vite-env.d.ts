/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_CLARITY_PROJECT_ID?: string
  readonly VITE_AI_PROMPT_PIPELINE_V2?: string
  readonly VITE_AI_PROMPT_DEBUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
