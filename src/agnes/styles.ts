export interface AgnesStylePreset {
  id: string
  label: string
  description: string
  promptSuffix: string
}

export const AGNES_BASE_PROMPT =
  '把参考图转换成适合拼豆图纸生成的拼豆分色稿，重点突出主体。放大主体，让主体占画面面积的 82-95%。使用纯色平涂色块，不要渐变、不要柔和阴影、不要抗锯齿、不要真实照片纹理。保持高对比、硬边缘、粗深色轮廓、有限配色和适合小尺寸拼豆网格的图标化构图。背景必须是透明或单一浅色空白，并且不应作为拼豆内容；不要大面积空白边距，不要让小主体漂浮在大片空背景中。'

export const AGNES_STYLE_PRESETS: AgnesStylePreset[] = [
  {
    id: 'perler-chart-draft',
    label: '拼豆分色稿',
    description: '少色、粗轮廓，最适合实际拼豆',
    promptSuffix:
      'Clean isolated perler bead pattern draft for later quantization. Use only 6 to 8 flat hard-edged colors for the subject. No gradients, no soft shadows, no anti-aliasing, no realistic skin texture. Use thick black or very dark outlines around hair, face, eyes, mouth, hands, clothing, and important object edges. Simplify facial features into readable pixel symbols: dark oval eyes, short simple mouth, minimal nose shadow. Preserve recognizable clothing patterns as large simple shapes. Remove background, text, and watermarks. Keep the background transparent or plain off-white and visually separate from the subject; it must not become part of the bead design. The image should be a clean source for a printable bead chart, not a realistic photo.',
  },
  {
    id: 'pixel-classic',
    label: '经典像素',
    description: '清晰色块，最适合拼豆量化',
    promptSuffix: '经典像素艺术风格，边缘清晰，复古游戏精灵图质感，大面积扁平色块，主体像游戏角色素材一样尽量铺满画布，减少无内容像素',
  },
  {
    id: 'cute-chibi',
    label: '可爱 Q 版',
    description: '像素 Q 版，大头小身体',
    promptSuffix:
      'Turn the image on the right into chibi pixel art like the character on the left. Huge head. Tiny body. Low-res grid. Cute exaggeration. Game-ready look. --ar 1:1 --style raw --c 20',
  },
  {
    id: 'flat-minimal',
    label: '扁平简约',
    description: '少细节，大色块，易于拼豆',
    promptSuffix: '扁平插画风格，细节尽量少，干净的几何色块，海报式裁切，主体大，背景边距很小',
  },
  {
    id: 'retro-8bit',
    label: '8-bit 复古',
    description: '怀旧游戏像素风',
    promptSuffix: '8-bit 复古游戏风格，粗颗粒像素，小色板，NES 游戏精灵质感，主体像游戏素材表中的角色一样接近铺满画布',
  },
  {
    id: 'perler-craft',
    label: '拼豆工艺感',
    description: '扁平拼豆插画风格',
    promptSuffix: '扁平拼豆图案插画风格，简化的手工拼豆质感，不要照片感，主体在画面中占主导，像拼豆图纸预览',
  },
  {
    id: 'simplified-real',
    label: '写实简化',
    description: '保留轮廓，减少渐变与细节',
    promptSuffix: '简化半写实风格，保留清晰轮廓，减少阴影和细节，使用适合拼豆的扁平颜色，近景半身或物体特写，周围空间尽量少',
  },
]

function buildGridSizePrompt(gridSize?: number) {
  if (!gridSize) return ''
  if (gridSize <= 32) {
    return '最终图纸最长边只有 24-32 格，请按超小拼豆图处理：最多 6 个主体主色，极粗轮廓，五官只保留眼睛和短嘴线，删除纹理、小物件和背景，只保留能在小格子中看懂的主体轮廓。背景不能占用拼豆格。'
  }
  if (gridSize <= 48) {
    return '最终图纸最长边约 32-48 格，请使用 6-8 个主体主色和大色块，保留发型、眼睛、嘴巴、脸型、手势和服装大特征，避免任何渐变、碎阴影和细小纹理。背景必须极简并可被裁掉，不能成为图案主体。'
  }
  if (gridSize <= 56) {
    return '目标图纸较小，请进一步简化为图标级构图，使用 8-10 个主体主色，只保留主体轮廓和关键特征，减少五官细节、纹理、小物件和背景元素，使用更大的色块。背景不要参与拼豆。'
  }
  return '即使目标图纸较大，也请保持拼豆友好的有限配色、清晰轮廓和硬边缘，避免照片级渐变和细碎纹理。'
}

function buildFramingPrompt(styleId: string) {
  if (styleId === 'cute-chibi') return ''
  return '构图要求：近景、紧凑裁切，主体居中，主体占画面 82-95%。背景使用透明或单一浅色极简背景，只在必要时保留很窄边距，并确保背景与主体有清楚边界便于后续删除。移除干扰性的场景、背景细节、文字和水印。人像请保留发型、眼睛、嘴巴、脸型、手势和服装图案，用深色轮廓分隔头发、脸、手、脖子和衣服。避免宽白边、过多留白、远景构图，以及小主体漂浮在空画布中的效果。'
}

export function buildAgnesPrompt(
  styleId: string,
  extraPrompt = '',
  gridSize?: number,
  compositionHint = '',
) {
  const style = AGNES_STYLE_PRESETS.find((item) => item.id === styleId)
  if (!style) throw new Error('请选择一种 AI 风格')

  const parts: string[] = []
  if (styleId !== 'cute-chibi') parts.push(AGNES_BASE_PROMPT)
  if (compositionHint.trim()) parts.push(compositionHint.trim())
  parts.push(style.promptSuffix)
  const gridSizePrompt = buildGridSizePrompt(gridSize)
  if (gridSizePrompt) parts.push(gridSizePrompt)
  const trimmedExtra = extraPrompt.trim()
  if (trimmedExtra) parts.push(trimmedExtra)
  const framingPrompt = buildFramingPrompt(styleId)
  if (framingPrompt) parts.push(framingPrompt)
  return parts.join(' ')
}
