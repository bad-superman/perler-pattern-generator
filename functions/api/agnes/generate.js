const DEFAULT_API_BASE = 'https://apihub.agnes-ai.com/v1/images/generations'
const DEFAULT_MODEL = 'agnes-image-2.1-flash'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

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

async function callAgnes({ prompt, size, ratio, imageDataUri, effectImageDataUri, env }) {
  const apiKey = env?.AGNES_API_KEY ?? ''
  const apiBase = env?.AGNES_API_BASE ?? DEFAULT_API_BASE
  const model = env?.AGNES_MODEL ?? DEFAULT_MODEL

  if (!apiKey) throw new Error('请先在 Cloudflare 环境变量中配置 AGNES_API_KEY')

  const body = {
    model,
    prompt,
    size,
    extra_body: {
      response_format: 'b64_json',
    },
  }
  if (ratio) body.ratio = ratio

  const inputImages = [imageDataUri, effectImageDataUri].filter(Boolean)
  if (inputImages.length > 0) {
    body.extra_body.image = inputImages
  } else {
    body.return_base64 = true
  }

  const response = await fetch(apiBase, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? `Agnes API 错误（${response.status}）`
    throw new Error(message)
  }

  const imageBase64 = payload?.data?.[0]?.b64_json
  const imageUrl = payload?.data?.[0]?.url
  if (!imageBase64 && !imageUrl) throw new Error('Agnes API 未返回图片')

  return {
    imageBase64: imageBase64 ?? undefined,
    imageUrl: imageUrl ?? undefined,
    mimeType: 'image/png',
  }
}

async function callAgnesMany({ prompt, size, ratio, count, imageDataUri, effectImageDataUri, env }) {
  const total = Math.min(4, Math.max(1, Number(count) || 1))
  const request = { prompt, size, ratio, imageDataUri, effectImageDataUri, env }
  if (total === 1) {
    const image = await callAgnes(request)
    return { ...image, images: [image] }
  }

  const settled = await Promise.allSettled(Array.from({ length: total }, () => callAgnes(request)))
  const images = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value)
  if (!images.length) {
    const reason = settled.find((item) => item.status === 'rejected')
    throw reason?.reason instanceof Error ? reason.reason : new Error('AI 生成失败')
  }
  return { ...images[0], images }
}

async function handlePost(context) {
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

  const result = await callAgnesMany({ prompt, size, ratio, count, imageDataUri, effectImageDataUri, env: context.env })
  return jsonResponse(200, result)
}

export async function onRequest(context) {
  try {
    const { method } = context.request

    if (method === 'GET') {
      return jsonResponse(200, {
        ok: true,
        route: '/api/agnes/generate',
        hasKey: Boolean(context.env?.AGNES_API_KEY),
      })
    }

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

    if (method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    return await handlePost(context)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'AI 生成失败'
    return jsonResponse(502, { error: message })
  }
}
