export interface AgnesStylePreset {
  id: string
  label: string
  description: string
  promptSuffix: string
}

export const AGNES_BASE_PROMPT =
  'Convert into a perler bead pattern reference image focused on the main subject. Zoom in on the subject so it occupies 75-90% of the image area. Use flat color blocks, no gradients, high contrast, hard edges, limited palette, and icon-like composition suitable for small bead grids. No wide empty margins and no tiny centered figure floating in vast blank space.'

export const AGNES_STYLE_PRESETS: AgnesStylePreset[] = [
  {
    id: 'pixel-classic',
    label: '经典像素',
    description: '清晰色块，最适合拼豆量化',
    promptSuffix: 'pixel art style, sharp edges, retro game sprite aesthetic, large flat color areas, sprite fills canvas edge to edge with minimal empty pixels',
  },
  {
    id: 'cute-chibi',
    label: '可爱 Q 版',
    description: '圆润造型，明亮 pastel 配色',
    promptSuffix: 'cute chibi style, rounded shapes, bright pastel colors, kawaii aesthetic, portrait crop with character filling most of the frame',
  },
  {
    id: 'flat-minimal',
    label: '扁平简约',
    description: '少细节，大色块，易于拼豆',
    promptSuffix: 'flat illustration, minimal detail, clean geometric color blocks, poster crop with large subject and tiny background margin',
  },
  {
    id: 'retro-8bit',
    label: '8-bit 复古',
    description: '怀旧游戏像素风',
    promptSuffix: '8-bit retro game style, chunky pixels, small color palette, NES sprite aesthetic, subject nearly full canvas like a game sprite sheet',
  },
  {
    id: 'perler-craft',
    label: '拼豆工艺感',
    description: '扁平拼豆插画风格',
    promptSuffix: 'flat perler bead pattern illustration, simplified bead craft look, not a photograph, subject dominates the image like a bead pattern preview',
  },
  {
    id: 'simplified-real',
    label: '写实简化',
    description: '保留轮廓，减少渐变与细节',
    promptSuffix: 'simplified semi-realistic style, bold outlines, reduced shading, bead-friendly flat colors, close-up bust or object with minimal surrounding space',
  },
]

export function buildAgnesPrompt(styleId: string, extraPrompt = '') {
  const style = AGNES_STYLE_PRESETS.find((item) => item.id === styleId)
  if (!style) throw new Error('请选择一种 AI 风格')

  const parts = [AGNES_BASE_PROMPT, style.promptSuffix]
  const trimmedExtra = extraPrompt.trim()
  if (trimmedExtra) parts.push(trimmedExtra)
  parts.push(
    'Framing: close-up tight crop, center the main subject, subject fills 75-90% of the image. Use a plain solid simplified background only as a thin margin if needed. Remove distracting scenery and background details. Avoid wide white borders, excessive padding, distant wide shots, and small subjects floating in empty canvas space.',
  )
  return parts.join(' ')
}
