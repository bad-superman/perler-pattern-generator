# AI Prompt Pipeline V2 开发计划

更新时间：2026-07-12

## 1. 产品决策

| 问题 | 决策 | 开发影响 |
|---|---|---|
| 产品目标 | AI 再创作型 | AI 生成仍是主路径，不追求原图忠实像素化 |
| Logo / 文字 | 允许 AI 重新设计 | Logo 也走 pixel icon / AI 风格化，不做保真保护 |
| Vision JSON | Prompt + 制造规划都要 | Vision 输出同时服务 Prompt Builder 和后处理策略 |
| 用户手选风格 | 尊重用户选择，但给风险提示 | Style Router 不能覆盖用户选择，只能提示风险 |
| Decision Gate | 需要，用环境变量控制 | 新旧流程并存，可灰度开启 |

---

## 2. 当前项目现状

当前 AI 生成链路：

```text
上传参考图
↓
前端 buildAgnesPrompt()
↓
/api/agnes/generate
↓
Agnes Image 2.1 Flash 图生图
↓
cropSubjectFromImage()
↓
generatePattern()
↓
Canvas 量化到 MARD/Hama 色卡
```

相关文件：

```text
src/agnes/styles.ts              当前 Prompt 预设
src/agnes/client.ts              调用 /api/agnes/generate
server/agnes-proxy.mjs           本地 Agnes 代理
functions/api/agnes/generate.js  Cloudflare Pages Function
src/App.tsx                      AI 模式 UI 与主流程
```

当前缺口：

1. Vision Analysis API
2. Vision JSON Schema
3. Prompt Builder 模块
4. Decision Gate
5. 风格自动推荐
6. 用户风格 override 风险提示
7. 制造策略字段
8. V2 调试面板输出

---

## 3. 目标 Pipeline

```text
User Image
↓
Vision Analysis
↓
Decision Gate
↓
Prompt Builder
↓
Agnes Image Generation
↓
Crop Subject
↓
Pixel Quantization
↓
MARD / Hama Mapping
↓
Perler Pattern
```

---

## 4. Decision Gate 设计

新增环境变量：

```env
VITE_AI_PROMPT_PIPELINE_V2=false
```

### 4.1 关闭时

保持当前流程不变：

```text
buildAgnesPrompt()
↓
generateAgnesImage()
```

### 4.2 开启时

启用新流程：

```text
analyzeImageForPerler()
↓
buildPromptFromVisionResult()
↓
generateAgnesImage()
```

新流程失败时自动 fallback 到当前 legacy `buildAgnesPrompt()`。

---

## 5. 建议新增 / 修改文件

### 5.1 新增 `src/agnes/visionTypes.ts`

职责：

- 定义 Vision JSON Schema
- 定义风格 ID
- 定义 pipeline 决策结果

建议风格：

```ts
type AiPrimaryStyle =
  | 'chibi'
  | 'retro_8bit'
  | 'pixel_icon'
  | 'limited_palette'
```

现有 6 个风格先保留，并做映射：

```text
cute-chibi       → chibi
retro-8bit       → retro_8bit
flat-minimal     → pixel_icon / limited_palette
pixel-classic    → limited_palette
perler-craft     → limited_palette
simplified-real  → limited_palette
```

### 5.2 新增 `src/agnes/visionPrompts.ts`

职责：

- Vision System Prompt
- Vision User Prompt
- JSON schema 约束
- 用户配置注入

### 5.3 新增 `src/agnes/promptBuilder.ts`

职责：

```text
Vision JSON
+
Style Template
+
Manufacturing Rules
+
User Config
↓
Final Prompt
```

Prompt Builder 不调用 LLM。

### 5.4 新增 `src/agnes/visionClient.ts`

前端调用：

```ts
analyzeImageForPerler({
  file,
  gridSize,
  maxColors,
  userStyle,
})
```

返回：

```ts
VisionPerlerAnalysis
```

### 5.5 新增后端 Vision 代理

本地代理新增：

```text
POST /api/agnes/analyze
```

涉及文件：

```text
server/agnes-proxy.mjs
```

Cloudflare Pages Function 新增：

```text
functions/api/agnes/analyze.js
```

注意：需要确认 Agnes 是否支持纯 Vision JSON 分析；如果不支持，后续可接 OpenAI / Gemini / Claude Vision 类接口。

---

## 6. Vision JSON Schema

建议 schema：

```json
{
  "subject": {
    "category": "",
    "description": "",
    "count": 1
  },
  "visual_features": {
    "shape_features": [],
    "color_features": [],
    "identity_features": []
  },
  "composition": {
    "layout": "",
    "pose": "",
    "crop_strategy": ""
  },
  "background": {
    "remove": true,
    "description": ""
  },
  "style_router": {
    "selected_style": "",
    "confidence": 0,
    "reason": "",
    "alternatives": [],
    "user_override_applied": false,
    "override_risk": ""
  },
  "pixel_strategy": {
    "detail_level": "",
    "outline": "",
    "shading": "",
    "recommended_resolution": "",
    "recommended_palette_size": ""
  },
  "manufacturing_strategy": {
    "min_region_size": "",
    "thin_line_policy": "",
    "small_detail_policy": "",
    "edge_cleanup": "",
    "background_policy": ""
  },
  "feasibility": {
    "score": 0,
    "risk_level": "",
    "issues": [],
    "recommended_user_action": ""
  },
  "prompt_content": {
    "subject_phrase": "",
    "feature_phrases": [],
    "composition_phrase": "",
    "style_phrase": "",
    "avoid_phrases": []
  }
}
```

重点新增字段：

```text
manufacturing_strategy
feasibility
prompt_content
style_router.user_override_applied
style_router.override_risk
```

---

## 7. Prompt Builder 方案

Positive Prompt 由代码拼接：

```text
CONTENT
+
STYLE TEMPLATE
+
PIXEL RULES
+
MANUFACTURING RULES
+
USER CONSTRAINTS
+
NEGATIVE-AS-INSTRUCTION
```

由于当前 Agnes 代理没有单独 negative prompt 字段，先把 negative prompt 转成约束写入正向 prompt：

```text
不要生成照片质感、真实拼豆、圆形豆子、网格线、复杂背景、文字、水印、渐变、柔边、抗锯齿、小碎细节。
```

---

## 8. App.tsx 主流程调整

当前流程：

```ts
const prompt = buildAgnesPrompt(aiStyleId, aiPrompt, gridSize, maxColors)

const aiFile = await generateAgnesImage({
  file: refFile,
  styleId: aiStyleId,
  extraPrompt: aiPrompt,
  gridSize,
  maxColors,
  size,
  prompt,
})
```

V2 流程：

```ts
if (isPromptPipelineV2Enabled()) {
  const vision = await analyzeImageForPerler({
    file: refFile,
    gridSize,
    maxColors,
    userStyle: aiStyleId,
  })

  const prompt = buildPromptFromVisionResult({
    vision,
    userPrompt: aiPrompt,
    gridSize,
    maxColors,
  })

  const aiFile = await generateAgnesImage({ prompt, ... })
} else {
  const prompt = buildAgnesPrompt(...)
  const aiFile = await generateAgnesImage(...)
}
```

---

## 9. UI 调整计划

MVP 不大改 UI。

先做：

1. AI 风格区保留现有 UI。
2. Debug 模式增加显示：
   - Vision JSON
   - Final Prompt
   - Style Router 结果
   - Feasibility 风险
3. 用户手选风格和 Vision 推荐不一致时，显示轻提示：

```text
已按你选择的风格生成。AI 判断该图片更适合 xxx 风格，当前风格可能导致细节丢失。
```

---

## 10. 环境变量计划

新增：

```env
VITE_AI_PROMPT_PIPELINE_V2=false
```

可选新增：

```env
VITE_AI_PROMPT_DEBUG=false
```

如果使用独立 Vision API，可新增：

```env
VISION_API_KEY=
VISION_API_BASE=
VISION_MODEL=
```

如果 Vision 和 Agnes 共用一个服务，先不加。

---

## 11. 分阶段开发计划

### Phase 1：安全接入 V2 开关

目标：不改变现有用户体验。

任务：

1. 新增环境变量读取函数。
2. 保留 Legacy Flow。
3. 在 `generateWithAi()` 中加分支。
4. 默认关闭 V2。

验收：

```text
VITE_AI_PROMPT_PIPELINE_V2=false 时，现有 AI 生成功能完全不变。
```

### Phase 2：补齐类型与 Prompt Builder

任务：

1. 新增 `visionTypes.ts`
2. 新增 `promptBuilder.ts`
3. 新增四类 Style Template：
   - chibi
   - retro_8bit
   - pixel_icon
   - limited_palette
4. 加入 manufacturing rules。
5. 加入用户风格 override 逻辑。

验收：

```text
给定 mock Vision JSON，可以稳定生成 final prompt。
```

### Phase 3：新增 Vision API

任务：

1. 新增前端 `visionClient.ts`
2. 新增本地接口 `/api/agnes/analyze`
3. 新增 Cloudflare Function `/api/agnes/analyze`
4. Vision 返回 JSON only
5. 前端做 JSON parse 和 fallback

验收：

```text
上传图片后可以得到稳定 Vision JSON。
Vision 出错时 fallback 到 Legacy Prompt。
```

### Phase 4：接入完整 V2 Pipeline

任务：

1. `generateWithAi()` 开启 V2 分支。
2. Vision → Prompt Builder → Agnes Generate。
3. Debug 面板显示：
   - Vision JSON
   - Final Prompt
   - AI 生成原图
4. 用户手选风格时尊重用户选择，只显示风险提示。

验收：

```text
VITE_AI_PROMPT_PIPELINE_V2=true 时走新流程。
false 时走旧流程。
```

### Phase 5：制造策略影响后处理

此阶段不是第一版必须，但建议预留。

可以根据 Vision 输出调整：

```text
sharpQuantize
cropSubjectFromImage
gridSize 建议
maxColors 建议
小色块清理策略
背景移除策略
```

第一版先不强制改量化算法，避免范围过大。

---

## 12. 暂缓内容

不建议立刻做：

1. 不马上替换现有 6 个 AI 风格 UI。
2. 不马上做自动重生成。
3. 不马上改量化算法。
4. 不马上引入 SDXL 参数，因为当前项目实际使用 Agnes。
5. 不马上做 Logo 保真路径，因为产品决策是 Logo 允许 AI 重新设计。

---

## 13. 推荐开发顺序

```text
1. 加 V2 环境变量开关
2. 加 Vision JSON 类型
3. 加 Prompt Builder
4. 用 mock Vision JSON 本地验证 Prompt
5. 加 /api/agnes/analyze
6. 接入 generateWithAi()
7. Debug 面板显示 Vision JSON
8. build / lint / 手动验证
```

---

## 14. 结论

当前项目适合做 “V2 Prompt Pipeline 增量接入”，不要推翻现有 AI 生成链路。使用环境变量灰度，新流程失败时自动 fallback 到当前 `buildAgnesPrompt()`，风险最低。
