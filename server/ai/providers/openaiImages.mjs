import { ProviderError } from '../types.mjs'

/**
 * Adapter for OpenAI-images-compatible endpoints (Agnes apihub, OpenAI
 * gpt-image, and most relay services). Sends a JSON body to `config.apiBase`
 * and expects `data[0].b64_json` or `data[0].url` back.
 *
 * @param {import('../types.mjs').GenerateRequest} request
 * @param {import('../types.mjs').ProviderConfig} config
 * @param {AbortSignal} signal
 * @returns {Promise<Omit<import('../types.mjs').GenerateResult, 'provider'>>}
 */
export async function generate(request, config, signal) {
  const body = {
    model: config.model,
    prompt: request.prompt,
    size: request.size,
    extra_body: {
      response_format: 'b64_json',
    },
  }
  if (request.ratio) body.ratio = request.ratio

  const inputImages = [request.imageDataUri, request.effectImageDataUri].filter(Boolean)
  if (inputImages.length > 0) {
    body.extra_body.image = inputImages
  } else {
    body.return_base64 = true
  }

  let response
  try {
    response = await fetch(config.apiBase, {
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

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? `上游接口错误（${response.status}）`
    throw new ProviderError(message, { status: response.status, model: config.model })
  }

  const imageBase64 = payload?.data?.[0]?.b64_json
  const imageUrl = payload?.data?.[0]?.url
  if (!imageBase64 && !imageUrl) {
    throw new ProviderError('接口未返回图片', { status: response.status, model: config.model })
  }

  return {
    imageBase64: imageBase64 ?? undefined,
    imageUrl: imageUrl ?? undefined,
    mimeType: 'image/png',
    model: config.model,
  }
}
