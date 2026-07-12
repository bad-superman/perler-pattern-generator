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
  chibi: 'Cute chibi pixel-art portrait. Large head, simplified facial features, expressive eyes, soft friendly look, rounded shapes, charming character design.',
  retro_8bit: 'Retro 8-bit pixel art sprite style. Nostalgic game character look, strong silhouette, chunky pixel shapes, high contrast, simple readable forms.',
  pixel_icon: 'Clean pixel icon style. Centered subject, iconic silhouette, geometric simplification, bold shapes, minimal background, easy to recognize at small size.',
  limited_palette: 'Limited-palette pixel art style. Clear silhouette, simplified forms, large connected color regions, crisp hard edges, bead-pattern friendly design.',
}

const SYSTEM_PROMPT = [
  'Create a clean pixel-art source image for a Perler bead pattern.',
  'This image will be cropped, resized, quantized, and mapped to real bead colors later.',
  'Prioritize readability, iconic shapes, clear silhouette, and large connected color regions over realism or fine details.',
].join(' ')

const NEGATIVE_AS_INSTRUCTION = [
  'Avoid photorealism, realistic beads, bead board, circular beads, peg holes, grid lines, text, watermark, busy background, noisy texture, tiny details, thin fragile lines, smooth airbrush shading, and excessive gradients.',
].join(' ')

function compactJoin(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join('\n\n')
}

function buildCraftConstraints(gridSize?: number, maxColors?: number) {
  const parts: string[] = [
    'Use broad shapes, clean edges, and connected color blocks.',
    'Keep only the most important identity features from the reference image.',
    'Simplify hair, clothing patterns, hands, facial details, logos, and accessories so they stay readable after bead-grid conversion.',
    'Use a plain, transparent-looking, or very minimal background.',
  ]

  if (gridSize) {
    parts.push(`The final bead pattern will be about ${gridSize} beads wide, so design the image to remain readable at that small size.`)
    if (gridSize <= 32) {
      parts.push('This is a very small pattern: use icon-level simplification, a strong silhouette, and only essential facial or object features.')
    } else if (gridSize <= 56) {
      parts.push('Use small-pattern simplification: avoid subtle facial details, small textures, and thin outlines that would disappear after resizing.')
    }
  }

  if (maxColors) {
    parts.push(`Use about ${maxColors} dominant colors or fewer. Prefer distinct colors and avoid many near-identical shades.`)
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
