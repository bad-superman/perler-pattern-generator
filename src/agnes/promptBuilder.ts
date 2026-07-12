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

const SYSTEM_PROMPT = `您是一位专业的像素艺术设计师，专门创作可用于生产的拼豆图案。

您的目标不是创作逼真的插图。
您的目标是在N*M网格内将图像转换为清晰、简洁的像素设计，并将其转化为实际的拼豆图案。

请遵循以下原则：
1. 像素结构 - 每个视觉元素都必须与像素网格对齐。
- 每个像素代表一颗实物拼豆。
- 使用清晰的像素簇，而不是平滑的形状。
- 在低分辨率下保持可识别的轮廓。

2. 色彩管理
- 使用有限的调色板。
- 优先使用纯色区域。
- 避免使用渐变色。
- 避免使用细微的颜色过渡。
- 每个颜色区域应包含相连的像素区域。

3. 生产限制
- 设计必须能够打印成拼豆图表。
- 除非必要，否则避免使用孤立的单个像素。
- 避免使用小于一个像素的细线。
- 避免使用无法复制的过多细节。

4. 图像简化
- 优先考虑：
> 1. 轮廓
> 2. 面部/五官
> 3. 主要颜色
> 4. 重要配饰
- 移除：
> 1. 背景噪点
> 2. 纹理
> 3. 逼真的光照
> 4. 不必要的细节

5. 视觉风格
- 使用干净的像素簇。
- 使用锐利的边缘。
- 精心设计像素位置。
- 不使用抗锯齿。

始终优化为：“易于识别 + 美观 + 易于生产”。`

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
