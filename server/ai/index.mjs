import { ProviderError } from './types.mjs'
import * as openaiImages from './providers/openaiImages.mjs'

export { resolveAiConfig, describeAiConfig } from './config.mjs'
export { ProviderError, AiConfigError } from './types.mjs'

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
 * Run one provider with its own timeout.
 * @param {import('./types.mjs').GenerateRequest} request
 * @param {import('./types.mjs').ProviderConfig} config
 * @param {import('./types.mjs').ProviderRole} role
 * @returns {Promise<import('./types.mjs').GenerateResult>}
 */
async function runProvider(request, config, role) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const result = await adapterFor(config.kind)(request, config, controller.signal)
    return { ...result, provider: role }
  } finally {
    clearTimeout(timer)
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
 * Generate a single image: try the default provider, and on any failure retry
 * once with the fallback provider when one is configured.
 *
 * @param {import('./types.mjs').GenerateRequest} request
 * @param {import('./types.mjs').AiConfig} config
 * @param {{ onFallback?: (info: { reason: string, from: string, to: string }) => void }} [hooks]
 * @returns {Promise<import('./types.mjs').GenerateResult>}
 */
export async function generateImage(request, config, hooks = {}) {
  try {
    return await runProvider(request, config.default, 'default')
  } catch (primaryError) {
    if (!config.fallback) throw primaryError

    hooks.onFallback?.({
      reason: primaryError instanceof Error ? primaryError.message : String(primaryError),
      from: config.default.model,
      to: config.fallback.model,
    })

    try {
      return await runProvider(request, config.fallback, 'fallback')
    } catch (fallbackError) {
      throw new ProviderError(
        `默认模型失败：${describeFailure(primaryError)}；备用模型失败：${describeFailure(fallbackError)}`,
        {
          status: fallbackError instanceof ProviderError ? fallbackError.status : 0,
          model: config.fallback.model,
          cause: { primary: primaryError, fallback: fallbackError },
        },
      )
    }
  }
}

/**
 * Generate `count` candidates in parallel. Each candidate independently goes
 * through default → fallback, so partial success still returns images.
 *
 * @param {import('./types.mjs').GenerateRequest} request
 * @param {number} count
 * @param {import('./types.mjs').AiConfig} config
 * @param {{ onFallback?: (info: { reason: string, from: string, to: string }) => void }} [hooks]
 * @returns {Promise<import('./types.mjs').GenerateResult & { images: import('./types.mjs').GenerateResult[] }>}
 */
export async function generateImages(request, count, config, hooks = {}) {
  const total = Math.min(MAX_CANDIDATES, Math.max(1, Number(count) || 1))
  if (total === 1) {
    const image = await generateImage(request, config, hooks)
    return { ...image, images: [image] }
  }

  const settled = await Promise.allSettled(
    Array.from({ length: total }, () => generateImage(request, config, hooks)),
  )
  const images = settled
    .filter((item) => item.status === 'fulfilled')
    .map((item) => /** @type {PromiseFulfilledResult<import('./types.mjs').GenerateResult>} */ (item).value)
  if (!images.length) {
    const rejected = settled.find((item) => item.status === 'rejected')
    const reason = rejected && 'reason' in rejected ? rejected.reason : null
    throw reason instanceof Error ? reason : new Error('AI 生成失败')
  }
  return { ...images[0], images }
}
