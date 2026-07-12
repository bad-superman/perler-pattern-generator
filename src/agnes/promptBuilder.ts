import { AGNES_BASE_PROMPT } from './styles'
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

const STYLE_TEMPLATES: Record<AiPrimaryStyle, string> = {
  chibi: '可爱 chibi 像素画风格，头身比夸张，轮廓圆润，表情和主体识别特征清楚，明亮有限色板，大块面构成。',
  retro_8bit: 'retro 8-bit 游戏精灵风格，低分辨率块状造型，硬边高对比，小色板，像经典游戏素材。',
  pixel_icon: 'pixel icon 图标风格，主体居中，剪影明确，几何化简化，大色块，极简背景，适合小尺寸识别。',
  limited_palette: 'limited palette 拼豆像素画风格，有限调色板，连续大色块，清晰轮廓，减少纹理与渐变。',
}

const NEGATIVE_AS_INSTRUCTION = '不要生成照片质感、真实拼豆、圆形豆子、网格线、复杂背景、文字、水印、渐变、柔边、抗锯齿、小碎细节。'

function compactJoin(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(' ')
}

function buildUserConstraints(gridSize?: number, maxColors?: number) {
  const parts: string[] = []
  if (gridSize) {
    parts.push(`目标像素宽度为 ${gridSize} 格，请按这个尺寸控制细节密度，每个像素点都应可对应一颗拼豆。`)
    if (gridSize <= 56) parts.push('尺寸较小，请使用图标级简化，只保留轮廓和关键识别特征。')
  }
  if (maxColors) parts.push(`整图最多使用 ${maxColors} 种主要颜色，避免用大量相近色模拟阴影。`)
  return parts.join(' ')
}

export function getEffectivePrimaryStyle(vision: VisionPerlerAnalysis, userStyle?: string): AiPrimaryStyle {
  const userPrimary = userStyle ? mapLegacyStyleToPrimary(userStyle) : undefined
  return userPrimary ?? vision.style_router.selected_style
}

export function buildPromptFromVisionResult(options: BuildPromptOptions) {
  const { vision, userPrompt = '', userStyle, gridSize, maxColors } = options
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
    AGNES_BASE_PROMPT,
    `内容：${vision.prompt_content.subject_phrase || vision.subject.description || vision.subject.category}。${featureText ? `关键特征：${featureText}。` : ''}`,
    `构图：${vision.prompt_content.composition_phrase || vision.composition.layout || '主体居中近景'}；姿态：${vision.composition.pose || '保持易识别姿态'}；裁切：${vision.composition.crop_strategy || '紧凑裁切'}。`,
    STYLE_TEMPLATES[effectiveStyle],
    vision.prompt_content.style_phrase,
    `像素策略：${vision.pixel_strategy.detail_level}；轮廓：${vision.pixel_strategy.outline}；阴影：${vision.pixel_strategy.shading}。`,
    `制造规则：最小色块 ${vision.manufacturing_strategy.min_region_size || '至少 2-3 格'}；细线策略 ${vision.manufacturing_strategy.thin_line_policy || '避免 1 像素孤立长线'}；小细节 ${vision.manufacturing_strategy.small_detail_policy || '合并或删除'}；边缘 ${vision.manufacturing_strategy.edge_cleanup || '清理毛边'}；背景 ${vision.manufacturing_strategy.background_policy || (vision.background.remove ? '移除或纯色背景' : '极简背景')}。`,
    buildUserConstraints(gridSize, maxColors),
    userPrompt.trim() ? `用户补充要求：${userPrompt.trim()}。` : undefined,
    avoidText,
    NEGATIVE_AS_INSTRUCTION,
  ])
}

export function getVisionOverrideRisk(vision: VisionPerlerAnalysis, userStyle?: string) {
  const userPrimary = userStyle ? mapLegacyStyleToPrimary(userStyle) : undefined
  if (!userPrimary || userPrimary === vision.style_router.selected_style) return ''
  return vision.style_router.override_risk || `已按你选择的风格生成。AI 判断该图片更适合 ${vision.style_router.selected_style} 风格，当前风格可能导致细节丢失。`
}
