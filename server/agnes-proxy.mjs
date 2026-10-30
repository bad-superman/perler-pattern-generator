import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AiConfigError,
  MAX_IMAGE_BYTES,
  describeAiConfig,
  formatAttemptLog,
  generateImages,
  maskKey,
  resolveAiConfig,
} from './ai/index.mjs'

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

// Resolve once at startup so misconfiguration fails fast with a clear message.
let aiConfig
try {
  aiConfig = resolveAiConfig(process.env)
} catch (cause) {
  console.error(`[ai] 配置错误：${cause instanceof Error ? cause.message : String(cause)}`)
  process.exit(1)
}

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

const generateHooks = {
  onAttempt(attempt, config) {
    const line = formatAttemptLog(attempt, config)
    if (attempt.ok) console.log(line)
    else console.warn(line)
  },
  onFallback({ from, to }) {
    console.warn(`[ai] fallback ${from} → ${to}`)
  },
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.url !== '/api/agnes/generate') {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  if (req.method === 'GET') {
    sendJson(res, 200, { ok: true, route: '/api/agnes/generate', ...describeAiConfig(aiConfig) })
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
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
    const size = parts.find((part) => part.name === 'size')?.data.toString('utf8').trim() || '1K'
    const ratio = parts.find((part) => part.name === 'ratio')?.data.toString('utf8').trim() || ''
    const count = Number(parts.find((part) => part.name === 'count')?.data.toString('utf8').trim() || '1')
    const imagePart = parts.find((part) => part.name === 'image' && part.data.length > 0)
    const effectImagePart = parts.find((part) => part.name === 'effectImage' && part.data.length > 0)

    if (!prompt) {
      sendJson(res, 400, { error: '缺少 prompt 参数' })
      return
    }

    if (imagePart && imagePart.data.length > MAX_IMAGE_BYTES) {
      sendJson(res, 400, { error: '图片过大，请上传 8MB 以内的图片' })
      return
    }
    if (effectImagePart && effectImagePart.data.length > MAX_IMAGE_BYTES) {
      sendJson(res, 400, { error: '效果参考图过大，请上传 8MB 以内的图片' })
      return
    }

    const request = {
      prompt,
      size,
      ratio,
      imageDataUri: imagePart ? fileToDataUri(imagePart) : undefined,
      effectImageDataUri: effectImagePart ? fileToDataUri(effectImagePart) : undefined,
    }
    console.log(`[ai] request count=${count} size=${size} ratio=${ratio || '-'} image=${imagePart ? `${Math.round(imagePart.data.length / 1024)}KB` : 'none'} effect=${effectImagePart ? 'yes' : 'no'}`)
    const result = await generateImages(request, count, aiConfig, generateHooks)
    sendJson(res, 200, result)
  } catch (cause) {
    if (cause instanceof AiConfigError) {
      sendJson(res, 500, { error: cause.message })
      return
    }
    const message = cause instanceof Error ? cause.message : 'AI 生成失败'
    const attempts = cause && typeof cause === 'object' && 'attempts' in cause ? cause.attempts : undefined
    console.error(`[ai] request failed: ${message}`)
    sendJson(res, 502, attempts ? { error: message, attempts } : { error: message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const summary = describeAiConfig(aiConfig)
  console.log(`Agnes proxy listening on http://127.0.0.1:${PORT}`)
  console.log(`[ai] default: ${summary.default.kind} / ${summary.default.model} key=${maskKey(aiConfig.default.apiKey)}`)
  console.log(summary.fallback && aiConfig.fallback
    ? `[ai] fallback: ${summary.fallback.kind} / ${summary.fallback.model} key=${maskKey(aiConfig.fallback.apiKey)}`
    : '[ai] fallback: 未配置（设置 AI_FALLBACK_MODEL 启用）')
})
