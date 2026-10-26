export interface AgnesStylePreset {
  id: string
  label: string
  description: string
  promptSuffix: string
}

export const AGNES_STYLE_PRESETS: AgnesStylePreset[] = [
  {
    id: 'cute-chibi',
    label: '可爱 Q 版',
    description: '大头小身，柔和配色',
    promptSuffix: 'Redraw the subject as a cute chibi character with an oversized head, a small body, round shapes, and a soft pastel palette.',
  },
  {
    id: 'retro-8bit',
    label: '复古游戏精灵',
    description: '粗颗粒、少颜色的游戏角色',
    promptSuffix: 'Redraw the subject as a retro video-game character with chunky shapes and a small bright palette.',
  },
  {
    id: 'flat-minimal',
    label: '扁平图标',
    description: '几何大色块，细节很少',
    promptSuffix: 'Redraw the subject as a flat geometric icon with very few shapes and almost no detail.',
  },
  {
    id: 'simplified-real',
    label: '写实简化',
    description: '保留轮廓、比例和主要特征',
    promptSuffix: 'Redraw the subject as a simplified illustration that keeps the original proportions, silhouette, and recognizable features.',
  },
]

const STYLE_ALIASES: Record<string, string> = {
  'pixel-classic': 'flat-minimal',
  'perler-craft': 'retro-8bit',
}

export const DEFAULT_NEGATIVE_PROMPT = ''

const RENDERING_PROMPT = 'Use bold clean outlines, solid color fills, and a very limited palette. Replace gradients, textures, and shadows with flat color. Remove the background and replace it with one plain color.'
const COMPOSITION_PROMPT = 'Center the subject and make it fill most of the frame with a tight crop.'

function resolveStyle(styleId: string) {
  const resolvedId = STYLE_ALIASES[styleId] ?? styleId
  return AGNES_STYLE_PRESETS.find((item) => item.id === resolvedId)
}

function simplificationPrompt(gridSize?: number) {
  if (!gridSize) return ''
  if (gridSize <= 32) return 'Simplify to icon level: keep the silhouette and only two or three key features, with no facial detail.'
  if (gridSize <= 56) return 'Use simplified features and large shapes.'
  return ''
}

export function buildAgnesPrompt(
  styleId: string,
  extraPrompt = '',
  gridSize?: number,
  maxColors?: number,
  negativePrompt = DEFAULT_NEGATIVE_PROMPT,
  hasEffectReference = false,
) {
  const style = resolveStyle(styleId)
  if (!style) throw new Error('请选择一种 AI 风格')

  const parts = [
    style.promptSuffix,
    'Keep the main subject, pose, and key identifying features of the first reference image.',
  ]
  const trimmedExtra = extraPrompt.trim()
  if (trimmedExtra) parts.push(trimmedExtra)
  parts.push(RENDERING_PROMPT)
  const simplification = simplificationPrompt(gridSize)
  if (simplification) parts.push(simplification)
  if (maxColors && maxColors <= 16) parts.push('Use two-tone shading at most.')
  parts.push(COMPOSITION_PROMPT)
  if (hasEffectReference) {
    parts.push('Use the first image as the subject reference. Use the second image only as the style reference for shape language, palette, and simplification. Do not copy the second image subject, text, or background.')
  }
  const trimmedNegative = negativePrompt.trim()
  if (trimmedNegative) parts.push(`Additional instruction: ${trimmedNegative}`)
  return parts.join(' ')
}
