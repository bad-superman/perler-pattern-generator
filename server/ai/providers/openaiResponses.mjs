import { ProviderError } from '../types.mjs'

const ERROR_SNIPPET_LENGTH = 160
const RESPONSE_IMAGE_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto'])

/**
 * @param {Response} response
 * @param {any} payload
 * @param {string} rawBody
 */
function describeHttpError(response, payload, rawBody) {
  const structured = payload?.error?.message ?? payload?.message
  let message = typeof structured === 'string' && structured.trim()
    ? structured.trim()
    : `上游接口错误（${response.status}）`

  if (!structured) {
    const snippet = rawBody.replace(/\s+/g, ' ').trim().slice(0, ERROR_SNIPPET_LENGTH)
    if (snippet) message += `：${snippet}`
  }

  const retryAfter = response.headers.get('retry-after')
  if (retryAfter) message += `（Retry-After: ${retryAfter}）`
  return message
}

/** @param {string} base */
function responsesEndpoint(base) {
  const normalized = base.replace(/\/+$/, '')
  return normalized.endsWith('/responses') ? normalized : `${normalized}/responses`
}

/**
 * Responses image generation accepts three concrete output shapes. The app's
 * existing 4:3 / 3:4 framing is mapped to the closest supported landscape or
 * portrait size while the browser-side crop preserves the requested framing.
 * @param {import('../types.mjs').GenerateRequest} request
 */
function responseImageSize(request) {
  if (RESPONSE_IMAGE_SIZES.has(request.size)) return request.size
  const [width, height] = String(request.ratio ?? '').split(':').map(Number)
  if (Number.isFinite(width) && Number.isFinite(height)) {
    if (width > height) return '1536x1024'
    if (height > width) return '1024x1536'
  }
  return '1024x1024'
}

/**
 * Adapter for OpenAI Responses-compatible endpoints with the image_generation
 * tool. Supports text-to-image and image-guided generation using data URLs.
 *
 * @param {import('../types.mjs').GenerateRequest} request
 * @param {import('../types.mjs').ProviderConfig} config
 * @param {AbortSignal} signal
 * @returns {Promise<Omit<import('../types.mjs').GenerateResult, 'provider'>>}
 */
export async function generate(request, config, signal) {
  const inputImages = [request.imageDataUri, request.effectImageDataUri].filter(Boolean)
  const content = [
    { type: 'input_text', text: request.prompt },
    ...inputImages.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl })),
  ]
  const body = {
    model: config.model,
    input: [{ role: 'user', content }],
    tools: [{
      type: 'image_generation',
      size: responseImageSize(request),
      quality: 'medium',
    }],
    tool_choice: { type: 'image_generation' },
  }

  let response
  try {
    response = await fetch(responsesEndpoint(config.apiBase), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    const aborted = signal.aborted || (cause instanceof Error && cause.name === 'AbortError')
    throw new ProviderError(
      aborted ? `请求超时（${Math.round(config.timeoutMs / 1000)}s）` : `网络错误：${cause instanceof Error ? cause.message : String(cause)}`,
      { status: 0, model: config.model, cause },
    )
  }

  const rawBody = await response.text().catch(() => '')
  let payload = null
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new ProviderError(describeHttpError(response, payload, rawBody), { status: response.status, model: config.model })
  }

  const imageCall = Array.isArray(payload?.output)
    ? payload.output.find((item) => item?.type === 'image_generation_call' && typeof item?.result === 'string')
    : null
  if (!imageCall?.result) {
    throw new ProviderError('Responses 接口未返回图片', { status: response.status, model: config.model })
  }

  return {
    imageBase64: imageCall.result,
    mimeType: 'image/png',
    model: config.model,
  }
}
