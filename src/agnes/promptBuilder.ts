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
  maxColors?: number
}

interface BuildPromptPipelineV2Options {
  styleId: string
  userPrompt?: string
  gridSize?: number
  maxColors?: number
}

const STYLE_TEMPLATES: Record<AiPrimaryStyle, string> = {
  chibi: '可爱 Q 版像素画风格，头身比适度夸张，圆润造型，表情简化友好，保留参考图主要造型特征。',
  retro_8bit: '复古 8-bit 像素画风格，轮廓清晰，块状造型，高对比，类似经典游戏素材。',
  pixel_icon: '干净的像素图标风格，主体居中，剪影明确，几何化简化，大色块，极简背景，小尺寸也容易识别。',
  limited_palette: '有限色板像素画风格，清晰轮廓，简化造型，连续大色块，硬边缘，适合后续拼豆量化。',
}

const SYSTEM_PROMPT = [
  '请根据参考图生成一张适合后续转换为拼豆图纸的像素画源图。',
  '重点是主体清晰、轮廓明确、大色块、少细节，方便后续裁切、缩放、限色和映射到真实拼豆色卡。',
  '不要追求照片级还原，也不要生成真实拼豆成品图。',
].join(' ')

const NEGATIVE_AS_INSTRUCTION = [
  '避免照片质感、真实拼豆、底板、网格线、文字、水印、复杂背景、噪点纹理、细碎小元素、脆弱细线和过多渐变。',
].join(' ')

function compactJoin(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join('\n\n')
}

function buildCraftConstraints(gridSize?: number, maxColors?: number) {
  const parts: string[] = [
    '使用宽大的形状、干净边缘和连续色块。',
    '保留参考图最重要的视觉特征，不做照片级复刻。',
    '简化发型、服装图案、手部、表情、小标记和配饰，让它们在缩小成拼豆格后仍然可读。',
    '使用纯色或极简背景。'
  ]

  if (gridSize) {
    parts.push(`最终拼豆图纸大约是 ${gridSize} 格宽，请按这个小尺寸设计，让缩小和量化后仍然容易识别。`)
    if (gridSize <= 32) {
      parts.push('这是很小的图纸，请使用图标级简化、强轮廓和最必要的视觉特征。')
    } else if (gridSize <= 56) {
      parts.push('请按小图纸简化，避免缩放后会消失的细微表情、小纹理和细线。')
    }
  }

  if (maxColors) {
    parts.push(`主要颜色控制在约 ${maxColors} 种以内，使用区分明显的颜色，避免大量相近色。`)
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
    `SYSTEM:\n${SYSTEM_PROMPT}`,
    `STYLE:\n${STYLE_TEMPLATES[effectiveStyle]}`,
    `CRAFT CONSTRAINTS:\n${buildCraftConstraints(options.gridSize, options.maxColors)}`,
    options.userPrompt?.trim() ? `USER REQUEST:\n${options.userPrompt.trim()}` : undefined,
    `NEGATIVE INSTRUCTIONS:\n${NEGATIVE_AS_INSTRUCTION}`,
  ])
}

export function buildPromptFromVisionResult(options: BuildPromptOptions) {
  const { vision, userPrompt = '', userStyle, gridSize, maxColors } = options
  const effectiveStyle = getEffectivePrimaryStyle(vision, userStyle)
  const featureText = [
    ...vision.visual_features.shape_features,
    ...vision.visual_features.color_features,
    ...vision.visual_features.identity_features,
    ...vision.prompt_content.feature_phrases,
  ].slice(0, 16).join(', ')
  const avoidText = vision.prompt_content.avoid_phrases.length > 0
    ? `Additional avoid list: ${vision.prompt_content.avoid_phrases.join(', ')}.`
    : ''

  return compactJoin([
    `SYSTEM:\n${SYSTEM_PROMPT}`,
    `CONTENT:\n${vision.prompt_content.subject_phrase || vision.subject.description || vision.subject.category}.${featureText ? ` Key identifying features: ${featureText}.` : ''}`,
    `COMPOSITION:\n${vision.prompt_content.composition_phrase || vision.composition.layout || 'Centered close-up subject'}; pose/action: ${vision.composition.pose || 'keep the subject recognizable'}; crop strategy: ${vision.composition.crop_strategy || 'tight crop'}; subject fills 75-90% of the canvas.`,
    `STYLE:\n${STYLE_TEMPLATES[effectiveStyle]} ${vision.prompt_content.style_phrase || ''}`,
    `CRAFT CONSTRAINTS:\n${buildCraftConstraints(gridSize, maxColors)} Detail level: ${vision.pixel_strategy.detail_level}; outline: ${vision.pixel_strategy.outline}; shading: ${vision.pixel_strategy.shading}. Minimum region size: ${vision.manufacturing_strategy.min_region_size || '2-3 beads'}; thin line policy: ${vision.manufacturing_strategy.thin_line_policy || 'avoid isolated one-pixel lines'}; small detail policy: ${vision.manufacturing_strategy.small_detail_policy || 'merge or remove tiny details'}; edge cleanup: ${vision.manufacturing_strategy.edge_cleanup || 'clean jagged edges'}; background: ${vision.manufacturing_strategy.background_policy || (vision.background.remove ? 'remove or plain background' : 'minimal background')}.`,
    userPrompt.trim() ? `USER REQUEST:\n${userPrompt.trim()}` : undefined,
    avoidText ? `ADDITIONAL AVOID:\n${avoidText}` : undefined,
    `NEGATIVE INSTRUCTIONS:\n${NEGATIVE_AS_INSTRUCTION}`,
  ])
}

export function getVisionOverrideRisk(vision: VisionPerlerAnalysis, userStyle?: string) {
  const userPrimary = userStyle && userStyle !== 'auto' ? mapLegacyStyleToPrimary(userStyle) : undefined
  if (!userPrimary || userPrimary === vision.style_router.selected_style) return ''
  return vision.style_router.override_risk || `已按你选择的风格生成。AI 判断该图片更适合 ${vision.style_router.selected_style} 风格，当前风格可能导致细节丢失。`
}
