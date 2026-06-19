import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const envPath = resolve(rootDir, '.env')

function loadEnvFile() {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile()

const PORT = Number(process.env.AGNES_PROXY_PORT ?? 8787)
const API_KEY = process.env.AGNES_API_KEY ?? ''
const API_BASE = process.env.AGNES_API_BASE ?? 'https://apihub.agnes-ai.com/v1/images/generations'
const MODEL = process.env.AGNES_MODEL ?? 'agnes-image-2.1-flash'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(payload))
}

function parseMultipart(buffer, boundary) {
  const parts = []
  const segments = buffer.toString('binary').split(`--${boundary}`)
  for (const segment of segments) {
    if (!segment || segment === '--\r\n' || segment === '--') continue
    const headerEnd = segment.indexOf('\r\n\r\n')
    if (headerEnd < 0) continue
    const headerText = segment.slice(0, headerEnd)
    let body = segment.slice(headerEnd + 4)
    if (body.endsWith('\r\n')) body = body.slice(0, -2)

    const nameMatch = headerText.match(/name="([^"]+)"/)
    const filenameMatch = headerText.match(/filename="([^"]+)"/)
    const typeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i)
    if (!nameMatch) continue

    parts.push({
      name: nameMatch[1],
      filename: filenameMatch?.[1] ?? '',
      contentType: typeMatch?.[1] ?? 'application/octet-stream',
      data: Buffer.from(body, 'binary'),
    })
  }
  return parts
}

async function readRequestBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function fileToDataUri(filePart) {
  const mimeType = filePart.contentType.startsWith('image/') ? filePart.contentType : 'image/png'
  return `data:${mimeType};base64,${filePart.data.toString('base64')}`
}

async function callAgnes({ prompt, size, imageDataUri }) {
  const body = {
    model: MODEL,
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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 360_000)

  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeout)
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.url !== '/api/agnes/generate' || req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  if (!API_KEY) {
    sendJson(res, 500, { error: '请先在 .env 中配置 AGNES_API_KEY' })
    return
  }

  try {
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.includes('multipart/form-data')) {
      sendJson(res, 400, { error: '请求格式无效' })
      return
    }

    const boundaryMatch = contentType.match(/boundary=(.+)$/)
    if (!boundaryMatch) {
      sendJson(res, 400, { error: '无法解析上传内容' })
      return
    }

    const rawBody = await readRequestBody(req)
    const parts = parseMultipart(rawBody, boundaryMatch[1])
    const prompt = parts.find((part) => part.name === 'prompt')?.data.toString('utf8').trim()
    const size = parts.find((part) => part.name === 'size')?.data.toString('utf8').trim() || '1024x1024'
    const imagePart = parts.find((part) => part.name === 'image' && part.data.length > 0)

    if (!prompt) {
      sendJson(res, 400, { error: '缺少 prompt 参数' })
      return
    }

    if (imagePart && imagePart.data.length > MAX_IMAGE_BYTES) {
      sendJson(res, 400, { error: '图片过大，请上传 8MB 以内的图片' })
      return
    }

    const imageDataUri = imagePart ? fileToDataUri(imagePart) : undefined
    const result = await callAgnes({ prompt, size, imageDataUri })
    sendJson(res, 200, result)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'AI 生成失败'
    sendJson(res, 502, { error: message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Agnes proxy listening on http://127.0.0.1:${PORT}`)
})
