import { mapLegacyStyleToPrimary, type AiPrimaryStyle, type VisionPerlerAnalysis, type VisionRequestOptions } from './visionTypes'

function stripJsonFence(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function asString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean)
  const stringValue = asString(value)
  return stringValue ? [stringValue] : []
}

function asPrimaryStyle(value: unknown, fallback: AiPrimaryStyle): AiPrimaryStyle {
  const style = asString(value)
  return ['chibi', 'retro_8bit', 'pixel_icon', 'limited_palette'].includes(style) ? style as AiPrimaryStyle : fallback
}

function normalizeVisionAnalysis(value: unknown, userStyle?: string): VisionPerlerAnalysis {
  const root = asRecord(value)
  const subject = asRecord(root.subject)
  const visualFeatures = asRecord(root.visual_features)
  const composition = asRecord(root.composition)
  const background = asRecord(root.background)
  const styleRouter = asRecord(root.style_router)
  const pixelStrategy = asRecord(root.pixel_strategy)
  const manufacturingStrategy = asRecord(root.manufacturing_strategy)
  const feasibility = asRecord(root.feasibility)
  const promptContent = asRecord(root.prompt_content)
  const fallbackStyle = userStyle && userStyle !== 'auto' ? mapLegacyStyleToPrimary(userStyle) : 'limited_palette'

  const analysis: VisionPerlerAnalysis = {
    subject: {
      category: asString(subject.category, '参考图主体'),
      description: asString(subject.description, '参考图中的主要主体'),
      count: asNumber(subject.count, 1),
    },
    visual_features: {
      shape_features: asStringArray(visualFeatures.shape_features),
      color_features: asStringArray(visualFeatures.color_features),
      identity_features: asStringArray(visualFeatures.identity_features),
    },
    composition: {
      layout: asString(composition.layout, '主体居中'),
      pose: asString(composition.pose, '保持参考图主体姿态'),
      crop_strategy: asString(composition.crop_strategy, '紧凑裁切'),
    },
    background: {
      remove: asBoolean(background.remove, true),
      description: asString(background.description),
    },
    style_router: {
      selected_style: asPrimaryStyle(styleRouter.selected_style, fallbackStyle),
      confidence: asNumber(styleRouter.confidence, 0.5),
      reason: asString(styleRouter.reason),
      alternatives: asStringArray(styleRouter.alternatives).map((item) => asPrimaryStyle(item, fallbackStyle)),
      user_override_applied: asBoolean(styleRouter.user_override_applied, false),
      override_risk: asString(styleRouter.override_risk),
    },
    pixel_strategy: {
      detail_level: asString(pixelStrategy.detail_level, '图标级简化'),
      outline: asString(pixelStrategy.outline, '清晰硬边轮廓'),
      shading: asString(pixelStrategy.shading, '少量块状阴影'),
      recommended_resolution: asString(pixelStrategy.recommended_resolution),
      recommended_palette_size: asString(pixelStrategy.recommended_palette_size),
    },
    manufacturing_strategy: {
      min_region_size: asString(manufacturingStrategy.min_region_size, '至少 2-3 格'),
      thin_line_policy: asString(manufacturingStrategy.thin_line_policy, '避免 1 像素孤立细线'),
      small_detail_policy: asString(manufacturingStrategy.small_detail_policy, '合并或删除小碎细节'),
      edge_cleanup: asString(manufacturingStrategy.edge_cleanup, '清理毛边'),
      background_policy: asString(manufacturingStrategy.background_policy, '纯色或极简背景'),
    },
    feasibility: {
      score: asNumber(feasibility.score, 0.7),
      risk_level: asString(feasibility.risk_level, 'medium'),
      issues: asStringArray(feasibility.issues),
      recommended_user_action: asString(feasibility.recommended_user_action),
    },
    prompt_content: {
      subject_phrase: asString(promptContent.subject_phrase, asString(subject.description, '参考图中的主要主体')),
      feature_phrases: asStringArray(promptContent.feature_phrases),
      composition_phrase: asString(promptContent.composition_phrase, '主体居中并占画面 75-90%'),
      style_phrase: asString(promptContent.style_phrase),
      avoid_phrases: asStringArray(promptContent.avoid_phrases),
    },
  }

  const portraitSignals = [
    analysis.subject.category,
    analysis.subject.description,
    ...analysis.visual_features.shape_features,
    ...analysis.visual_features.identity_features,
    analysis.prompt_content.subject_phrase,
    ...analysis.prompt_content.feature_phrases,
  ].join(' ')
  const isPortrait = /人|人物|人像|肖像|男孩|女孩|少年|少女|儿童|孩子|脸|面部|眼睛|头发|发型|托腮|portrait|face|boy|girl|child/i.test(portraitSignals)
  if (isPortrait && (!userStyle || userStyle === 'auto')) {
    const originalStyle = analysis.style_router.selected_style
    analysis.style_router.selected_style = 'chibi'
    analysis.style_router.confidence = Math.max(analysis.style_router.confidence, 0.85)
    analysis.style_router.reason = analysis.style_router.reason
      ? `检测到人物/肖像主体，产品规则优先推荐 chibi；原模型推荐 ${originalStyle}：${analysis.style_router.reason}`
      : `检测到人物/肖像主体，产品规则优先推荐 chibi；原模型推荐 ${originalStyle}`
    analysis.style_router.alternatives = Array.from(new Set([originalStyle, ...analysis.style_router.alternatives].filter((item) => item !== 'chibi')))
  }

  return analysis
}

function normalizeAnalysis(value: unknown, userStyle?: string): VisionPerlerAnalysis {
  const candidate = value && typeof value === 'object' && 'analysis' in value
    ? (value as { analysis: unknown }).analysis
    : value
  if (!candidate || typeof candidate !== 'object') throw new Error('Vision 返回 JSON 无效')
  return normalizeVisionAnalysis(candidate, userStyle)
}

export async function analyzeImageForPerler(options: VisionRequestOptions): Promise<VisionPerlerAnalysis> {
  const form = new FormData()
  form.append('image', options.file)
  form.append('gridSize', String(options.gridSize))
  form.append('maxColors', String(options.maxColors))
  form.append('userStyle', options.userStyle ?? 'auto')

  const response = await fetch('/api/agnes/analyze', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(180_000),
  })

  const payload = await response.json().catch(() => null) as { analysis?: unknown; rawText?: string; error?: string } | null
  if (!response.ok) throw new Error(payload?.error ?? `Vision 分析失败（${response.status}）`)
  if (!payload) throw new Error('Vision 返回数据无效')
  if (payload.rawText && !payload.analysis) return normalizeAnalysis(JSON.parse(stripJsonFence(payload.rawText)), options.userStyle)
  return normalizeAnalysis(payload, options.userStyle)
}
