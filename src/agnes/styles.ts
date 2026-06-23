export interface AgnesStylePreset {
  id: string
  label: string
  description: string
  promptSuffix: string
}

export const AGNES_BASE_PROMPT =
  '把参考图转换成适合拼豆图纸生成的参考图，重点突出主体。放大主体，让主体占画面面积的 75-90%。使用扁平色块，不要渐变，保持高对比、硬边缘、有限配色和适合小尺寸拼豆网格的图标化构图。不要大面积空白边距，不要让小主体漂浮在大片空背景中。'

export const AGNES_STYLE_PRESETS: AgnesStylePreset[] = [
  {
    id: 'pixel-classic',
    label: '经典像素',
    description: '清晰色块，最适合拼豆量化',
    promptSuffix: '经典像素艺术风格，边缘清晰，复古游戏精灵图质感，大面积扁平色块，主体像游戏角色素材一样尽量铺满画布，减少无内容像素',
  },
  {
    id: 'cute-chibi',
    label: '可爱 Q 版',
    description: '2 头身超变形，贴纸感 Q 版',
    promptSuffix:
      '日本动画超级变形 Q 版（SD/chibi）风格，严格 2 头身比例（头部高度约等于全身高度），超大圆润脑袋，极小身体和短粗圆润四肢，手套状小手、圆润小脚，占脸部很大比例的大眼睛、极小点状鼻子、小巧嘴型，五官位置偏靠下。保留参考图的发型发色、服装主色和标志性配饰，但极度简化身体与服装细节。明亮柔和配色，赛璐璐平涂大色块，贴纸感可爱造型。不要写实人体比例，不要照片质感，不要普通 7-8 头身动漫人体，不要细手指和长四肢，不要细致肌肉阴影和复杂褶皱。',
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
  if (!gridSize || gridSize > 56) return ''
  return '目标图纸很小，请进一步简化为图标级构图，只保留主体轮廓和关键特征，减少五官细节、纹理、小物件和背景元素，使用更少颜色和更大的色块。'
}

function buildChibiGuardPrompt(styleId: string) {
  if (styleId !== 'cute-chibi') return ''
  return '重要：必须把人物变形为 2 头身超级 Q 版，不能保留写实脸或常规模型动漫身材。若参考图是真人或写实插画，需彻底卡通化变形，而不是仅美化原图。'
}

function buildFramingPrompt(styleId: string) {
  if (styleId === 'cute-chibi') {
    return '构图要求：全身或半身站立的 2 头身 Q 版构图，近景、紧凑裁切，主体居中，主体占画面 75-90%。不要只画写实大头特写。背景使用纯色或极简背景，只在必要时保留很窄边距。移除干扰性的场景和背景细节。避免宽白边、过多留白、远景构图，以及小主体漂浮在空画布中的效果。'
  }
  return '构图要求：近景、紧凑裁切，主体居中，主体占画面 75-90%。背景使用纯色或极简背景，只在必要时保留很窄边距。移除干扰性的场景和背景细节。避免宽白边、过多留白、远景构图，以及小主体漂浮在空画布中的效果。'
}

export function buildAgnesPrompt(styleId: string, extraPrompt = '', gridSize?: number) {
  const style = AGNES_STYLE_PRESETS.find((item) => item.id === styleId)
  if (!style) throw new Error('请选择一种 AI 风格')

  const parts = [AGNES_BASE_PROMPT, style.promptSuffix]
  const chibiGuardPrompt = buildChibiGuardPrompt(styleId)
  if (chibiGuardPrompt) parts.push(chibiGuardPrompt)
  const gridSizePrompt = buildGridSizePrompt(gridSize)
  if (gridSizePrompt) parts.push(gridSizePrompt)
  const trimmedExtra = extraPrompt.trim()
  if (trimmedExtra) parts.push(trimmedExtra)
  parts.push(buildFramingPrompt(styleId))
  return parts.join(' ')
}
