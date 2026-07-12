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
const DEFAULT_VISION_MODEL = 'agnes-2.0-flash'

function deriveVisionApiBase(base) {
  return (base || 'https://apihub.agnes-ai.com/v1/images/generations').replace(/\/v1\/images\/generations\/?$/, '/v1/chat/completions')
}

function buildVisionSystemPrompt() {
  return [
    'You analyze reference images for a perler bead / pixel art generation pipeline.',
    'Return JSON only. Do not include markdown fences or explanations.',
    'The JSON must follow the requested schema and all text values should be concise Chinese phrases.',
    'Optimize for AI re-creation and manufacturable pixel art, not faithful pixelization.',
  ].join(' ')
}

function buildVisionUserPrompt({ gridSize, maxColors, userStyle }) {
  return `请分析这张参考图，并输出可用于拼豆像素画 AI 再创作的 JSON。用户选择风格：${userStyle}。目标宽度：${gridSize} 格。最大颜色数：${maxColors}。如果用户风格不适合，请仍然尊重用户选择，在 style_router.user_override_applied 标记 true 并给出 override_risk。Schema: {"subject":{"category":"","description":"","count":1},"visual_features":{"shape_features":[],"color_features":[],"identity_features":[]},"composition":{"layout":"","pose":"","crop_strategy":""},"background":{"remove":true,"description":""},"style_router":{"selected_style":"chibi|retro_8bit|pixel_icon|limited_palette","confidence":0.8,"reason":"","alternatives":[],"user_override_applied":false,"override_risk":""},"pixel_strategy":{"detail_level":"","outline":"","shading":"","recommended_resolution":"","recommended_palette_size":""},"manufacturing_strategy":{"min_region_size":"","thin_line_policy":"","small_detail_policy":"","edge_cleanup":"","background_policy":""},"feasibility":{"score":0.8,"risk_level":"low|medium|high","issues":[],"recommended_user_action":""},"prompt_content":{"subject_phrase":"","feature_phrases":[],"composition_phrase":"","style_phrase":"","avoid_phrases":[]}}`
}

function mapLegacyStyleToPrimary(styleId) {
  const mapping = {
    'cute-chibi': 'chibi',
    'retro-8bit': 'retro_8bit',
    'flat-minimal': 'pixel_icon',
    'pixel-classic': 'limited_palette',
    'perler-craft': 'limited_palette',
    'simplified-real': 'limited_palette',
  }
  return mapping[styleId] ?? 'limited_palette'
}

function buildFallbackAnalysis({ gridSize, maxColors, userStyle }) {
  const selectedStyle = mapLegacyStyleToPrimary(userStyle)
  return {
    subject: { category: '参考图主体', description: '保留参考图中的主要对象并进行像素画再创作', count: 1 },
    visual_features: {
      shape_features: ['主体清晰', '轮廓简化', '关键外形优先'],
      color_features: ['提取主色', '有限调色板', '高对比色块'],
      identity_features: ['保留最有辨识度的特征'],
    },
    composition: { layout: '主体居中近景', pose: '保持参考图主体姿态', crop_strategy: '紧凑裁切，减少留白' },
    background: { remove: true, description: '移除复杂背景或改为纯色背景' },
    style_router: { selected_style: selectedStyle, confidence: 0.5, reason: '未配置独立 Vision API，使用用户风格生成通用制造规划', alternatives: ['limited_palette'], user_override_applied: false, override_risk: '' },
    pixel_strategy: { detail_level: gridSize <= 56 ? '图标级简化' : '中等细节', outline: '清晰硬边轮廓', shading: '少量块状阴影', recommended_resolution: `${gridSize} 格宽`, recommended_palette_size: `${maxColors} 色以内` },
    manufacturing_strategy: { min_region_size: '至少 2-3 格连续色块', thin_line_policy: '避免孤立 1 格细线', small_detail_policy: '删除或合并小碎细节', edge_cleanup: '清理毛边与孤立点', background_policy: '纯色或透明感极简背景' },
    feasibility: { score: 0.7, risk_level: 'medium', issues: ['未进行真实视觉识别，细节可能需要手动补充描述'], recommended_user_action: '如主体复杂，请在补充描述中写明必须保留的特征' },
    prompt_content: { subject_phrase: '参考图中的主要主体', feature_phrases: ['清晰轮廓', '大色块', '有限颜色', '适合拼豆制作'], composition_phrase: '主体居中并占画面 75-90%', style_phrase: '', avoid_phrases: ['复杂背景', '细碎纹理', '小文字'] },
  }
}

function stripJsonFence(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

function parseVisionText(text) {
  const stripped = stripJsonFence(text)
  try {
    return JSON.parse(stripped)
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Vision API 未返回可解析 JSON')
    return JSON.parse(match[0])
  }
}

async function callVisionApi({ imageDataUri, gridSize, maxColors, userStyle, env }) {
  const apiKey = env?.VISION_API_KEY || env?.AGNES_API_KEY || ''
  if (!apiKey) return buildFallbackAnalysis({ gridSize, maxColors, userStyle })

  const apiBase = env?.VISION_API_BASE || deriveVisionApiBase(env?.AGNES_API_BASE || API_BASE)
  const model = env?.VISION_MODEL || DEFAULT_VISION_MODEL
  const response = await fetch(apiBase, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 8192,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: buildVisionSystemPrompt() },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildVisionUserPrompt({ gridSize, maxColors, userStyle }) },
            { type: 'image_url', image_url: { url: imageDataUri } },
          ],
        },
      ],
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? `Vision API 错误（${response.status}）`
    throw new Error(message)
  }
  const message = payload?.choices?.[0]?.message
  const text = typeof message?.content === 'string' ? message.content : Array.isArray(message?.content) ? message.content.map((item) => item?.text ?? '').join('') : ''
  if (!text) throw new Error(`Vision API 未返回分析结果：${JSON.stringify(payload).slice(0, 500)}`)
  try {
    return parseVisionText(text)
  } catch (cause) {
    const fallback = buildFallbackAnalysis({ gridSize, maxColors, userStyle })
    const messageText = cause instanceof Error ? cause.message : 'Vision JSON 解析失败'
    fallback.style_router.reason = `Agnes Vision 已响应但 JSON 解析失败，使用通用制造规划：${messageText}`
    fallback.feasibility.issues = [messageText, ...fallback.feasibility.issues]
    return fallback
  }
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

  if (!['/api/agnes/generate', '/api/agnes/analyze'].includes(req.url ?? '') || req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  if (req.url === '/api/agnes/generate' && !API_KEY) {
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

    if (req.url === '/api/agnes/analyze') {
      if (!imagePart) {
        sendJson(res, 400, { error: '缺少 image 参数' })
        return
      }
      if (imagePart.data.length > MAX_IMAGE_BYTES) {
        sendJson(res, 400, { error: '图片过大，请上传 8MB 以内的图片' })
        return
      }
      const gridSize = Number(parts.find((part) => part.name === 'gridSize')?.data.toString('utf8')) || 52
      const maxColors = Number(parts.find((part) => part.name === 'maxColors')?.data.toString('utf8')) || 24
      const userStyle = parts.find((part) => part.name === 'userStyle')?.data.toString('utf8').trim() || 'pixel-classic'
      const analysis = await callVisionApi({ imageDataUri: fileToDataUri(imagePart), gridSize, maxColors, userStyle, env: process.env })
      sendJson(res, 200, { analysis })
      return
    }

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
