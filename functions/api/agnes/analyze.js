const DEFAULT_AGNES_API_BASE = 'https://apihub.agnes-ai.com/v1/images/generations'
const DEFAULT_VISION_MODEL = 'agnes-2.0-flash'

function deriveVisionApiBase(base) {
  return (base || DEFAULT_AGNES_API_BASE).replace(/\/v1\/images\/generations\/?$/, '/v1/chat/completions')
}
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
  return Boolean(value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && typeof value.size === 'number' && value.size > 0)
}

async function blobToDataUri(blob) {
  const mimeType = blob.type?.startsWith('image/') ? blob.type : 'image/png'
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`
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
    visual_features: { shape_features: ['主体清晰', '轮廓简化'], color_features: ['提取主色', '有限调色板'], identity_features: ['保留最有辨识度的特征'] },
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

function buildVisionSystemPrompt() {
  return 'You analyze reference images for a perler bead / pixel art generation pipeline. Return JSON only. The JSON must follow the requested schema and all text values should be concise Chinese phrases.'
}

function buildVisionUserPrompt({ gridSize, maxColors, userStyle }) {
  return `请分析这张参考图，并输出拼豆像素画 AI 再创作 JSON。用户选择风格：${userStyle}。目标宽度：${gridSize} 格。最大颜色数：${maxColors}。必须包含 subject, visual_features, composition, background, style_router, pixel_strategy, manufacturing_strategy, feasibility, prompt_content。style_router.selected_style 只能是 chibi、retro_8bit、pixel_icon、limited_palette。`
}

async function callVisionApi({ imageDataUri, gridSize, maxColors, userStyle, env }) {
  const apiKey = env?.VISION_API_KEY || env?.AGNES_API_KEY || ''
  if (!apiKey) return buildFallbackAnalysis({ gridSize, maxColors, userStyle })
  const response = await fetch(env?.VISION_API_BASE || deriveVisionApiBase(env?.AGNES_API_BASE || DEFAULT_AGNES_API_BASE), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env?.VISION_MODEL || DEFAULT_VISION_MODEL,
      temperature: 0.1,
      max_tokens: 8192,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: buildVisionSystemPrompt() },
        { role: 'user', content: [{ type: 'text', text: buildVisionUserPrompt({ gridSize, maxColors, userStyle }) }, { type: 'image_url', image_url: { url: imageDataUri } }] },
      ],
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? `Vision API 错误（${response.status}）`)
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

async function handlePost(context) {
  const formData = await context.request.formData()
  const image = formData.get('image')
  if (!isUpload(image)) return jsonResponse(400, { error: '缺少 image 参数' })
  if (image.size > MAX_IMAGE_BYTES) return jsonResponse(400, { error: '图片过大，请上传 8MB 以内的图片' })

  const gridSize = Number(formData.get('gridSize')) || 52
  const maxColors = Number(formData.get('maxColors')) || 24
  const userStyle = String(formData.get('userStyle') ?? 'pixel-classic')
  const analysis = await callVisionApi({ imageDataUri: await blobToDataUri(image), gridSize, maxColors, userStyle, env: context.env })
  return jsonResponse(200, { analysis })
}

export async function onRequest(context) {
  try {
    const { method } = context.request
    if (method === 'GET') return jsonResponse(200, { ok: true, route: '/api/agnes/analyze', hasVisionKey: Boolean(context.env?.VISION_API_KEY || context.env?.AGNES_API_KEY), visionModel: context.env?.VISION_MODEL || DEFAULT_VISION_MODEL })
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { Allow: 'GET, POST, OPTIONS', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })
    }
    if (method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })
    return await handlePost(context)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Vision 分析失败'
    return jsonResponse(502, { error: message })
  }
}
