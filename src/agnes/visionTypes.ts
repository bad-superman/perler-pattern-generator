export type AiPrimaryStyle = 'chibi' | 'retro_8bit' | 'pixel_icon' | 'limited_palette'

export type AgnesLegacyStyleId =
  | 'cute-chibi'
  | 'retro-8bit'
  | 'flat-minimal'
  | 'pixel-classic'
  | 'perler-craft'
  | 'simplified-real'

export interface VisionPerlerAnalysis {
  subject: {
    category: string
    description: string
    count: number
  }
  visual_features: {
    shape_features: string[]
    color_features: string[]
    identity_features: string[]
  }
  composition: {
    layout: string
    pose: string
    crop_strategy: string
  }
  background: {
    remove: boolean
    description: string
  }
  style_router: {
    selected_style: AiPrimaryStyle
    confidence: number
    reason: string
    alternatives: AiPrimaryStyle[]
    user_override_applied: boolean
    override_risk: string
  }
  pixel_strategy: {
    detail_level: string
    outline: string
    shading: string
    recommended_resolution: string
    recommended_palette_size: string
  }
  manufacturing_strategy: {
    min_region_size: string
    thin_line_policy: string
    small_detail_policy: string
    edge_cleanup: string
    background_policy: string
  }
  feasibility: {
    score: number
    risk_level: 'low' | 'medium' | 'high' | string
    issues: string[]
    recommended_user_action: string
  }
  prompt_content: {
    subject_phrase: string
    feature_phrases: string[]
    composition_phrase: string
    style_phrase: string
    avoid_phrases: string[]
  }
}

export interface VisionRequestOptions {
  file: File
  gridSize: number
  maxColors: number
  userStyle?: string
}

export interface PromptPipelineDebugInfo {
  mode: 'legacy' | 'v2' | 'v2-fallback'
  vision?: VisionPerlerAnalysis
  finalPrompt: string
  effectiveStyle?: AiPrimaryStyle
  userStyleOverride?: string
  fallbackReason?: string
}

export const LEGACY_TO_PRIMARY_STYLE: Record<string, AiPrimaryStyle> = {
  'cute-chibi': 'chibi',
  'retro-8bit': 'retro_8bit',
  'flat-minimal': 'pixel_icon',
  'pixel-classic': 'limited_palette',
  'perler-craft': 'limited_palette',
  'simplified-real': 'limited_palette',
}

export const PRIMARY_STYLE_LABELS: Record<AiPrimaryStyle, string> = {
  chibi: '可爱 Q 版',
  retro_8bit: '8-bit 复古',
  pixel_icon: '像素图标',
  limited_palette: '有限色拼豆',
}

export function mapLegacyStyleToPrimary(styleId: string): AiPrimaryStyle {
  return LEGACY_TO_PRIMARY_STYLE[styleId] ?? 'limited_palette'
}

export function isPromptPipelineV2Enabled() {
  return import.meta.env.VITE_AI_PROMPT_PIPELINE_V2 === 'true'
}

export function isPromptDebugEnabled() {
  return import.meta.env.VITE_AI_PROMPT_DEBUG === 'true'
}
