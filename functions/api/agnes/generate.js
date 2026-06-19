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
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
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

async function callAgnes({ prompt, size, imageDataUri, env }) {
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

  if (imageDataUri) {
    body.extra_body.image = [imageDataUri]
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

async function handlePost(context) {
  const formData = await context.request.formData()
  const prompt = String(formData.get('prompt') ?? '').trim()
  const size = String(formData.get('size') ?? '1024x1024').trim() || '1024x1024'
  const image = formData.get('image')

  if (!prompt) return jsonResponse(400, { error: '缺少 prompt 参数' })

  let imageDataUri
  if (isUpload(image)) {
    if (image.size > MAX_IMAGE_BYTES) {
      return jsonResponse(400, { error: '图片过大，请上传 8MB 以内的图片' })
    }
    imageDataUri = await blobToDataUri(image)
  }

  const result = await callAgnes({ prompt, size, imageDataUri, env: context.env })
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
