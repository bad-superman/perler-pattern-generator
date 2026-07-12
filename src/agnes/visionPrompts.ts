export function buildVisionSystemPrompt() {
  return [
    'You analyze reference images for a perler bead / pixel art generation pipeline.',
    'Return JSON only. Do not include markdown fences or explanations.',
    'The JSON must follow the requested schema and all text values should be concise Chinese phrases.',
    'Optimize for AI re-creation and manufacturable pixel art, not faithful pixelization.',
  ].join(' ')
}

export function buildVisionUserPrompt(options: { gridSize: number; maxColors: number; userStyle: string }) {
  return `请分析这张参考图，并输出可用于拼豆像素画 AI 再创作的 JSON。用户选择风格：${options.userStyle}。目标宽度：${options.gridSize} 格。最大颜色数：${options.maxColors}。如果用户风格不适合，请仍然尊重用户选择，在 style_router.user_override_applied 标记 true 并给出 override_risk。`
}

export const VISION_JSON_SCHEMA_DESCRIPTION = `{
  "subject": { "category": "", "description": "", "count": 1 },
  "visual_features": { "shape_features": [], "color_features": [], "identity_features": [] },
  "composition": { "layout": "", "pose": "", "crop_strategy": "" },
  "background": { "remove": true, "description": "" },
  "style_router": { "selected_style": "chibi|retro_8bit|pixel_icon|limited_palette", "confidence": 0.8, "reason": "", "alternatives": [], "user_override_applied": false, "override_risk": "" },
  "pixel_strategy": { "detail_level": "", "outline": "", "shading": "", "recommended_resolution": "", "recommended_palette_size": "" },
  "manufacturing_strategy": { "min_region_size": "", "thin_line_policy": "", "small_detail_policy": "", "edge_cleanup": "", "background_policy": "" },
  "feasibility": { "score": 0.8, "risk_level": "low|medium|high", "issues": [], "recommended_user_action": "" },
  "prompt_content": { "subject_phrase": "", "feature_phrases": [], "composition_phrase": "", "style_phrase": "", "avoid_phrases": [] }
}`
