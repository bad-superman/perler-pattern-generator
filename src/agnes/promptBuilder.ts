import {
  mapLegacyStyleToPrimary,
  type AiPrimaryStyle,
  type VisionPerlerAnalysis,
} from './visionTypes'

interface BuildPromptOptions {
  vision: VisionPerlerAnalysis
  userPrompt?: string
  userStyle?: string
  gridSize?: number
  gridRows?: number
  maxColors?: number
}

interface BuildPromptPipelineV2Options {
  styleId: string
  userPrompt?: string
  gridSize?: number
  gridRows?: number
  maxColors?: number
}

const STYLE_TEMPLATES: Record<AiPrimaryStyle, string> = {
  chibi: 'Chibi pixel art，Q版大头比例，kawaii，可爱，配色明亮。',
  retro_8bit: 'Retro 8-bit pixel art，NES sprite 风格，低分辨率，高对比，游戏感。',
  pixel_icon: 'Pixel icon art，icon sprite 风格，简洁，主体清晰，剪影明确。',
  limited_palette: 'Limited palette pixel art，clean pixel clusters，色块清晰，轮廓明确。',
}

function buildSystemPrompt(gridSize?: number, gridRows?: number, maxColors?: number) {
  const gridText = gridSize ? `${gridSize}*${gridRows ?? gridSize}` : 'N*M'
  const colorText = maxColors ? `${maxColors}` : 'n'
  return `你是一个像素画创作大师，擅长创作不同风格的像素画

你的职责：
根据用户提供的图片，在${gridText}的网格中，使用${colorText}种颜色创作指定风格的像素画

其中：
像素画风格、M、N、n用户会提供`
}

const NEGATIVE_AS_INSTRUCTION = [
  '避免照片质感、真实拼豆、底板、网格线、文字、水印、复杂背景、噪点纹理、细碎小元素、脆弱细线和过多渐变。',
].join(' ')

function compactJoin(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join('\n\n')
}

function buildCraftConstraints(gridSize?: number, gridRows?: number, maxColors?: number) {
  const parts: string[] = []
  if (gridSize) {
    parts.push(`网格大小：${gridSize}×${gridRows ?? gridSize}。`)
  }
  if (maxColors) {
    parts.push(`配色数量：小于等于 ${maxColors} 种。`)
  }
  return parts.join(' ')
}

export function getEffectivePrimaryStyle(vision: VisionPerlerAnalysis, userStyle?: string): AiPrimaryStyle {
  const userPrimary = userStyle && userStyle !== 'auto' ? mapLegacyStyleToPrimary(userStyle) : undefined
  return userPrimary ?? vision.style_router.selected_style
}

export function getEffectivePrimaryStyleFromLegacy(styleId: string): AiPrimaryStyle {
  return mapLegacyStyleToPrimary(styleId)
}

export function buildPromptPipelineV2(options: BuildPromptPipelineV2Options) {
  const effectiveStyle = getEffectivePrimaryStyleFromLegacy(options.styleId)
  return compactJoin([
    `系统提示词：
${buildSystemPrompt(options.gridSize, options.gridRows, options.maxColors)}`,
    `STYLE：
${STYLE_TEMPLATES[effectiveStyle]}`,
    `CRAFT CONSTRAINTS：
${buildCraftConstraints(options.gridSize, options.gridRows, options.maxColors)}`,
    options.userPrompt?.trim() ? `用户补充：
${options.userPrompt.trim()}` : undefined,
    `避免内容：
${NEGATIVE_AS_INSTRUCTION}`,
  ])
}

export function buildPromptFromVisionResult(options: BuildPromptOptions) {
  const { vision, userPrompt = '', userStyle, gridSize, gridRows, maxColors } = options
  const effectiveStyle = getEffectivePrimaryStyle(vision, userStyle)
  const featureText = [
    ...vision.visual_features.shape_features,
    ...vision.visual_features.color_features,
    ...vision.visual_features.identity_features,
    ...vision.prompt_content.feature_phrases,
  ].slice(0, 16).join('，')
  const avoidText = vision.prompt_content.avoid_phrases.length > 0
    ? `额外避免：${vision.prompt_content.avoid_phrases.join('，')}。`
    : ''

  return compactJoin([
    `系统提示词：
${buildSystemPrompt(gridSize, gridRows, maxColors)}`,
    `内容：
${vision.prompt_content.subject_phrase || vision.subject.description || vision.subject.category}${featureText ? `。关键特征：${featureText}` : ''}`,
    `构图：
${vision.prompt_content.composition_phrase || vision.composition.layout || '主体居中近景'}；姿态/动作：${vision.composition.pose || '保持易识别姿态'}；裁切：${vision.composition.crop_strategy || '紧凑裁切'}。`,
    `STYLE：
${STYLE_TEMPLATES[effectiveStyle]} ${vision.prompt_content.style_phrase || ''}`,
    `CRAFT CONSTRAINTS：
${buildCraftConstraints(gridSize, gridRows, maxColors)}`,
    userPrompt.trim() ? `用户补充：
${userPrompt.trim()}` : undefined,
    avoidText ? `额外避免：
${avoidText}` : undefined,
    `避免内容：
${NEGATIVE_AS_INSTRUCTION}`,
  ])
}

export function getVisionOverrideRisk(vision: VisionPerlerAnalysis, userStyle?: string) {
  const userPrimary = userStyle && userStyle !== 'auto' ? mapLegacyStyleToPrimary(userStyle) : undefined
  if (!userPrimary || userPrimary === vision.style_router.selected_style) return ''
  return vision.style_router.override_risk || `已按你选择的风格生成。AI 判断该图片更适合 ${vision.style_router.selected_style} 风格，当前风格可能导致细节丢失。`
}
