import { ProviderError, maskKey } from './types.mjs'
import * as openaiImages from './providers/openaiImages.mjs'

export { resolveAiConfig, describeAiConfig } from './config.mjs'
export { ProviderError, AiConfigError, maskKey } from './types.mjs'

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_CANDIDATES = 4

/**
 * @param {import('./types.mjs').ProviderKind} kind
 * @returns {(request: import('./types.mjs').GenerateRequest, config: import('./types.mjs').ProviderConfig, signal: AbortSignal) => Promise<Omit<import('./types.mjs').GenerateResult, 'provider'>>}
 */
function adapterFor(kind) {
  switch (kind) {
    case 'openai-images':
      return openaiImages.generate
    default:
      throw new ProviderError(`未知的 provider 类型：${kind}`)
  }
}

/**
 * @typedef {Object} GenerateHooks
 * @property {(attempt: import('./types.mjs').ProviderAttempt, config: import('./types.mjs').ProviderConfig) => void} [onAttempt]
 *   Called after every provider call, success or failure. Use for logging.
 * @property {(info: { reason: string, from: string, to: string }) => void} [onFallback]
 *   Called when the default provider failed and the fallback is about to run.
 */

/**
 * Run one provider with its own timeout and record the attempt.
 * @param {import('./types.mjs').GenerateRequest} request
 * @param {import('./types.mjs').ProviderConfig} config
 * @param {import('./types.mjs').ProviderRole} role
 * @param {import('./types.mjs').ProviderAttempt[]} attempts
 * @param {GenerateHooks} hooks
 * @returns {Promise<import('./types.mjs').GenerateResult>}
 */
async function runProvider(request, config, role, attempts, hooks) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  const startedAt = Date.now()
  /** @type {import('./types.mjs').ProviderAttempt} */
  const attempt = { provider: role, model: config.model, ok: false, status: 0, reason: '', durationMs: 0 }
  try {
    const result = await adapterFor(config.kind)(request, config, controller.signal)
    attempt.ok = true
    attempt.status = 200
    return { ...result, provider: role }
  } catch (cause) {
    attempt.status = cause instanceof ProviderError ? cause.status : 0
    attempt.reason = cause instanceof Error ? cause.message : String(cause)
    throw cause
  } finally {
    clearTimeout(timer)
    attempt.durationMs = Date.now() - startedAt
    attempts.push(attempt)
    hooks.onAttempt?.(attempt, config)
  }
}

/**
 * @param {unknown} cause
 */
function describeFailure(cause) {
  if (cause instanceof ProviderError) {
    return cause.model ? `${cause.model}：${cause.message}` : cause.message
  }
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Attach the attempt log to any error so HTTP layers can return it.
 * @param {unknown} cause
 * @param {import('./types.mjs').ProviderAttempt[]} attempts
 */
function withAttempts(cause, attempts) {
  const error = cause instanceof Error ? cause : new Error(String(cause))
  // Object.assign instead of a `(error).attempts = …` line: a leading paren
  // would be parsed as a call on the previous line (no-semicolon style).
  return Object.assign(error, { attempts })
}

/**
 * Generate a single image: try the default provider, and on any failure retry
 * once with the fallback provider when one is configured. The returned result
 * (or thrown error) carries `attempts` describing every provider call made.
 *
 * @param {import('./types.mjs').GenerateRequest} request
 * @param {import('./types.mjs').AiConfig} config
 * @param {GenerateHooks} [hooks]
 * @returns {Promise<import('./types.mjs').GenerateResult & { attempts: import('./types.mjs').ProviderAttempt[] }>}
 */
export async function generateImage(request, config, hooks = {}) {
  /** @type {import('./types.mjs').ProviderAttempt[]} */
  const attempts = []
  try {
    const result = await runProvider(request, config.default, 'default', attempts, hooks)
    return { ...result, attempts }
  } catch (primaryError) {
    if (!config.fallback) throw withAttempts(primaryError, attempts)

    hooks.onFallback?.({
      reason: primaryError instanceof Error ? primaryError.message : String(primaryError),
      from: config.default.model,
      to: config.fallback.model,
    })

    try {
      const result = await runProvider(request, config.fallback, 'fallback', attempts, hooks)
      return { ...result, attempts }
    } catch (fallbackError) {
      throw withAttempts(new ProviderError(
        `默认模型失败：${describeFailure(primaryError)}；备用模型失败：${describeFailure(fallbackError)}`,
        {
          status: fallbackError instanceof ProviderError ? fallbackError.status : 0,
          model: config.fallback.model,
          cause: { primary: primaryError, fallback: fallbackError },
        },
      ), attempts)
    }
  }
}

/**
 * Generate `count` candidates in parallel. Each candidate independently goes
 * through default → fallback, so partial success still returns images. The
 * top-level `attempts` is the flattened log across all candidates.
 *
 * @param {import('./types.mjs').GenerateRequest} request
 * @param {number} count
 * @param {import('./types.mjs').AiConfig} config
 * @param {GenerateHooks} [hooks]
 * @returns {Promise<import('./types.mjs').GenerateResult & { images: import('./types.mjs').GenerateResult[], attempts: import('./types.mjs').ProviderAttempt[] }>}
 */
export async function generateImages(request, count, config, hooks = {}) {
  const total = Math.min(MAX_CANDIDATES, Math.max(1, Number(count) || 1))
  if (total === 1) {
    const { attempts, ...image } = await generateImage(request, config, hooks)
    return { ...image, images: [image], attempts }
  }

  const settled = await Promise.allSettled(
    Array.from({ length: total }, () => generateImage(request, config, hooks)),
  )
  /** @type {import('./types.mjs').ProviderAttempt[]} */
  const attempts = []
  /** @type {import('./types.mjs').GenerateResult[]} */
  const images = []
  /** @type {Error | null} */
  let firstError = null
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      const { attempts: own, ...image } = item.value
      attempts.push(...own)
      images.push(image)
    } else {
      const error = item.reason instanceof Error ? item.reason : new Error(String(item.reason))
      attempts.push(...(/** @type {any} */ (error).attempts ?? []))
      firstError ??= error
    }
  }
  if (!images.length) {
    throw withAttempts(firstError ?? new Error('AI 生成失败'), attempts)
  }
  return { ...images[0], images, attempts }
}

/**
 * One-line, secret-free log entry for an attempt. Shared by both servers so
 * local and Cloudflare logs read the same.
 * @param {import('./types.mjs').ProviderAttempt} attempt
 * @param {import('./types.mjs').ProviderConfig} config
 */
export function formatAttemptLog(attempt, config) {
  const outcome = attempt.ok ? 'ok' : 'fail'
  const parts = [
    `[ai] ${attempt.provider} ${attempt.model}`,
    `key=${maskKey(config.apiKey)}`,
    `status=${attempt.status}`,
    outcome,
    `${(attempt.durationMs / 1000).toFixed(1)}s`,
  ]
  if (!attempt.ok && attempt.reason) parts.push(`reason=${attempt.reason}`)
  return parts.join(' ')
}
