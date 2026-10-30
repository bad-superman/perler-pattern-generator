import {
  AiConfigError,
  MAX_IMAGE_BYTES,
  describeAiConfig,
  generateImages,
  resolveAiConfig,
} from '../../../server/ai/index.mjs'

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x400
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function isUpload(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.arrayBuffer === 'function'
    && typeof value.size === 'number'
    && value.size > 0,
  )
}

async function blobToDataUri(blob) {
  const mimeType = blob.type?.startsWith('image/') ? blob.type : 'image/png'
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`
}

function logFallback({ reason, from, to }) {
  console.warn(`[ai] fallback ${from} → ${to}：${reason}`)
}

async function handlePost(context, aiConfig) {
  const formData = await context.request.formData()
  const prompt = String(formData.get('prompt') ?? '').trim()
  const size = String(formData.get('size') ?? '1K').trim() || '1K'
  const ratio = String(formData.get('ratio') ?? '').trim()
  const count = Number(formData.get('count') ?? '1')
  const image = formData.get('image')
  const effectImage = formData.get('effectImage')

  if (!prompt) return jsonResponse(400, { error: '缺少 prompt 参数' })

  let imageDataUri
  let effectImageDataUri
  if (isUpload(image)) {
    if (image.size > MAX_IMAGE_BYTES) {
      return jsonResponse(400, { error: '图片过大，请上传 8MB 以内的图片' })
    }
    imageDataUri = await blobToDataUri(image)
  }
  if (isUpload(effectImage)) {
    if (effectImage.size > MAX_IMAGE_BYTES) {
      return jsonResponse(400, { error: '效果参考图过大，请上传 8MB 以内的图片' })
    }
    effectImageDataUri = await blobToDataUri(effectImage)
  }

  const request = { prompt, size, ratio, imageDataUri, effectImageDataUri }
  const result = await generateImages(request, count, aiConfig, { onFallback: logFallback })
  return jsonResponse(200, result)
}

export async function onRequest(context) {
  try {
    const { method } = context.request

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          Allow: 'GET, POST, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (method !== 'GET' && method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    // Resolve per request: Pages Functions have no startup hook, and env can
    // differ between preview and production deployments.
    let aiConfig
    try {
      aiConfig = resolveAiConfig(context.env ?? {})
    } catch (cause) {
      if (method === 'GET') {
        return jsonResponse(200, {
          ok: false,
          route: '/api/agnes/generate',
          error: cause instanceof Error ? cause.message : String(cause),
        })
      }
      throw cause
    }

    if (method === 'GET') {
      return jsonResponse(200, { ok: true, route: '/api/agnes/generate', ...describeAiConfig(aiConfig) })
    }

    return await handlePost(context, aiConfig)
  } catch (cause) {
    if (cause instanceof AiConfigError) {
      return jsonResponse(500, { error: cause.message })
    }
    const message = cause instanceof Error ? cause.message : 'AI 生成失败'
    return jsonResponse(502, { error: message })
  }
}
