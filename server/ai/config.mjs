import { AiConfigError } from './types.mjs'

export const DEFAULT_API_BASE = 'https://apihub.agnes-ai.com/v1/images/generations'
export const DEFAULT_MODEL = 'agnes-image-2.1-flash'
export const DEFAULT_PROVIDER_KIND = 'openai-images'
export const DEFAULT_TIMEOUT_MS = 150_000

/** @type {ReadonlyArray<import('./types.mjs').ProviderKind>} */
export const PROVIDER_KINDS = ['openai-images']

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} key
 */
function readString(env, key) {
  const value = env[key]
  if (typeof value !== 'string') return ''
  return value.trim()
}

/**
 * @param {string} raw
 * @param {string} key
 */
function parseTimeout(raw, key) {
  if (!raw) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new AiConfigError(`${key} 必须是大于 0 的毫秒数，当前为 "${raw}"`)
  }
  return Math.round(value)
}

/**
 * @param {string} raw
 * @param {string} key
 * @returns {import('./types.mjs').ProviderKind | undefined}
 */
function parseKind(raw, key) {
  if (!raw) return undefined
  if (!PROVIDER_KINDS.includes(/** @type {any} */ (raw))) {
    throw new AiConfigError(`${key} 不支持的 provider "${raw}"，可选值：${PROVIDER_KINDS.join(', ')}`)
  }
  return /** @type {import('./types.mjs').ProviderKind} */ (raw)
}

/**
 * Resolve default + fallback provider configuration from environment variables.
 *
 * Precedence for the default model: `AI_DEFAULT_*` → legacy `AGNES_*` → built-in
 * defaults. The fallback is enabled only when `AI_FALLBACK_MODEL` is set; its
 * other fields inherit from the default model when left empty.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {import('./types.mjs').AiConfig}
 */
export function resolveAiConfig(env) {
  const defaultConfig = {
    kind: parseKind(readString(env, 'AI_DEFAULT_PROVIDER'), 'AI_DEFAULT_PROVIDER') ?? DEFAULT_PROVIDER_KIND,
    apiKey: readString(env, 'AI_DEFAULT_API_KEY') || readString(env, 'AGNES_API_KEY'),
    apiBase: readString(env, 'AI_DEFAULT_API_BASE') || readString(env, 'AGNES_API_BASE') || DEFAULT_API_BASE,
    model: readString(env, 'AI_DEFAULT_MODEL') || readString(env, 'AGNES_MODEL') || DEFAULT_MODEL,
    timeoutMs: parseTimeout(readString(env, 'AI_DEFAULT_TIMEOUT_MS'), 'AI_DEFAULT_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS,
  }

  if (!defaultConfig.apiKey) {
    throw new AiConfigError('请先配置 AI_DEFAULT_API_KEY（或兼容的 AGNES_API_KEY）')
  }

  const fallbackModel = readString(env, 'AI_FALLBACK_MODEL')
  /** @type {import('./types.mjs').ProviderConfig | null} */
  let fallbackConfig = null
  if (fallbackModel) {
    fallbackConfig = {
      kind: parseKind(readString(env, 'AI_FALLBACK_PROVIDER'), 'AI_FALLBACK_PROVIDER') ?? defaultConfig.kind,
      apiKey: readString(env, 'AI_FALLBACK_API_KEY') || defaultConfig.apiKey,
      apiBase: readString(env, 'AI_FALLBACK_API_BASE') || defaultConfig.apiBase,
      model: fallbackModel,
      timeoutMs: parseTimeout(readString(env, 'AI_FALLBACK_TIMEOUT_MS'), 'AI_FALLBACK_TIMEOUT_MS') ?? defaultConfig.timeoutMs,
    }
  }

  return { default: defaultConfig, fallback: fallbackConfig }
}

/**
 * Public, secret-free summary for health checks and logs.
 * @param {import('./types.mjs').AiConfig} config
 */
export function describeAiConfig(config) {
  const describe = (/** @type {import('./types.mjs').ProviderConfig} */ item) => ({
    kind: item.kind,
    model: item.model,
    timeoutMs: item.timeoutMs,
  })
  return {
    default: describe(config.default),
    fallback: config.fallback ? describe(config.fallback) : null,
  }
}
