export interface AgnesStylePreset {
  id: string
  label: string
  description: string
  promptSuffix: string
}

export const AGNES_BASE_PROMPT =
  'Convert into a perler bead pattern reference image with flat color blocks, no gradients, high contrast, clear edges, limited palette, grid-friendly composition.'

export const AGNES_STYLE_PRESETS: AgnesStylePreset[] = [
  {
    id: 'pixel-classic',
    label: '经典像素',
    description: '清晰色块，最适合拼豆量化',
    promptSuffix: 'pixel art style, sharp edges, retro game sprite aesthetic',
  },
  {
    id: 'cute-chibi',
    label: '可爱 Q 版',
    description: '圆润造型，明亮 pastel 配色',
    promptSuffix: 'cute chibi style, rounded shapes, bright pastel colors, kawaii aesthetic',
  },
  {
    id: 'flat-minimal',
    label: '扁平简约',
    description: '少细节，大色块，易于拼豆',
    promptSuffix: 'flat illustration, minimal detail, clean geometric color blocks',
  },
  {
    id: 'retro-8bit',
    label: '8-bit 复古',
    description: '怀旧游戏像素风',
    promptSuffix: '8-bit retro game style, chunky pixels, small color palette, NES aesthetic',
  },
  {
    id: 'perler-craft',
    label: '拼豆工艺感',
    description: '强调豆子质感与手工感',
    promptSuffix: 'perler bead craft photo style, visible round beads, handmade craft aesthetic',
  },
  {
    id: 'simplified-real',
    label: '写实简化',
    description: '保留轮廓，减少渐变与细节',
    promptSuffix: 'simplified semi-realistic style, bold outlines, reduced shading, bead-friendly',
  },
]

export function buildAgnesPrompt(styleId: string, extraPrompt = '') {
  const style = AGNES_STYLE_PRESETS.find((item) => item.id === styleId)
  if (!style) throw new Error('请选择一种 AI 风格')

  const parts = [AGNES_BASE_PROMPT, style.promptSuffix]
  const trimmedExtra = extraPrompt.trim()
  if (trimmedExtra) parts.push(trimmedExtra)
  parts.push('while preserving the original composition and main subject layout.')
  return parts.join(' ')
}
