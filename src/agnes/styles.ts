export interface AgnesStylePreset {
  id: string
  label: string
  description: string
  promptSuffix: string
}

export const AGNES_BASE_PROMPT =
  '把参考图直接转换成适合拼豆量化的像素画，而不是普通插画或照片。重点突出主体，主体占画面面积的 75-90%，近景、紧凑裁切、主体居中。每一个像素点都应对应最终图纸中的一格/一颗拼豆，使用清晰方形像素块、硬边缘、无抗锯齿、无渐变、无照片纹理、无柔光阴影。不要生成真实拼豆、圆形豆子、底板、孔洞、网格线或纸张效果，只输出干净的像素画图像。背景使用纯色或极简背景，避免大面积空白边距，避免小主体漂浮在大片空背景中。'

export const AGNES_STYLE_PRESETS: AgnesStylePreset[] = [
  {
    id: 'pixel-classic',
    label: '经典像素',
    description: '清晰色块，最适合拼豆量化',
    promptSuffix: '经典像素艺术风格，边缘清晰，复古游戏精灵图质感，大面积扁平像素色块，主体像游戏角色素材一样尽量铺满画布，减少无内容像素',
  },
  {
    id: 'cute-chibi',
    label: '可爱 Q 版',
    description: '圆润造型，明亮 pastel 配色',
    promptSuffix: '可爱 Q 版像素画风格，造型圆润，明亮柔和配色，卡哇伊视觉，使用近景头像或半身构图，让角色填充大部分画面',
  },
  {
    id: 'flat-minimal',
    label: '扁平简约',
    description: '少细节，大色块，易于拼豆',
    promptSuffix: '扁平极简像素画风格，细节尽量少，干净的几何像素色块，海报式裁切，主体大，背景边距很小',
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
    promptSuffix: '适合拼豆工艺的扁平像素画风格，简化为清晰像素图案，不要照片感，不要真实豆子质感，主体在画面中占主导，像可直接量化的像素图纸',
  },
  {
    id: 'simplified-real',
    label: '写实简化',
    description: '保留轮廓，减少渐变与细节',
    promptSuffix: '简化半写实像素画风格，保留清晰轮廓，减少阴影和细节，使用适合拼豆的扁平像素颜色，近景半身或物体特写，周围空间尽量少',
  },
]

function buildPixelSpecPrompt(gridSize?: number, maxColors?: number) {
  const parts: string[] = []
  if (gridSize) {
    parts.push(
      `像素画尺寸要求：以 ${gridSize}px 作为图片宽度，也就是横向 ${gridSize} 个像素点/格；每格就是一个独立像素点，并对应最终拼豆图纸的一颗豆。输出图像可以被放大显示，但必须保持 ${gridSize}px 宽像素画的低分辨率逻辑和方形像素边缘。请按这个宽度规划细节密度，不要生成超出该宽度承载能力的细碎纹理。`,
    )
    if (gridSize <= 56) {
      parts.push('目标像素画很小，请进一步简化为图标级构图，只保留主体轮廓和关键特征，减少五官细节、纹理、小物件和背景元素，使用更大的像素色块。')
    }
  }
  if (maxColors) {
    parts.push(`颜色数量要求：整张像素画最多使用 ${maxColors} 种主要颜色，请使用有限调色板、大色块和高对比，不要用渐变、噪点或大量相近色来模拟阴影。`)
  }
  return parts.join(' ')
}

export function buildAgnesPrompt(styleId: string, extraPrompt = '', gridSize?: number, maxColors?: number) {
  const style = AGNES_STYLE_PRESETS.find((item) => item.id === styleId)
  if (!style) throw new Error('请选择一种 AI 风格')

  const parts = [AGNES_BASE_PROMPT, style.promptSuffix]
  const pixelSpecPrompt = buildPixelSpecPrompt(gridSize, maxColors)
  if (pixelSpecPrompt) parts.push(pixelSpecPrompt)
  const trimmedExtra = extraPrompt.trim()
  if (trimmedExtra) parts.push(trimmedExtra)
  parts.push(
    '最终输出要求：这是一张用于后续量化的像素画源图。请保证像素块边界清楚、色块连续、轮廓明确；不要输出平滑插画、高清照片、复杂背景、文字、水印、边框或装饰网格。构图要求：近景、紧凑裁切，主体居中，主体占画面 75-90%。背景使用纯色或极简背景，只在必要时保留很窄边距。移除干扰性的场景和背景细节。避免宽白边、过多留白、远景构图，以及小主体漂浮在空画布中的效果。',
  )
  return parts.join(' ')
}
