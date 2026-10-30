# 镜像开关与 AI Provider Fallback 开发计划

更新时间：2026-10-30

本计划覆盖三项需求：

1. 图纸预览与导出 PNG 增加镜像开关。
2. 大模型调用支持多 provider，默认模型失败后用 fallback 重试。
3. default 与 fallback 模型通过环境变量独立配置。

已确认的产品决策：

- 镜像只做水平翻转；作用于预览（整体图纸、放大查看、手机端）和导出 PNG；编辑模式始终显示原图。
- fallback 对**任何失败**都切换（含 4xx），不区分错误类型。
- 具体 fallback 厂商暂未定，首期只实现 OpenAI images 兼容协议的适配器，但 provider 接口要抽象好，后续加新协议只需新增一个适配器文件。

---

## 1. 现状

### 1.1 图纸渲染点

图纸数据 `pattern: BeadCell[][]` 由 `usePatternHistory` 管理，有 4 个渲染点直接读它：

| 位置 | 文件 | 说明 |
|---|---|---|
| 桌面整体图纸 | `src/App.tsx` `renderGrid()` | CSS grid，`pattern.flat()` 逐格渲染 |
| 手机端整体图纸 | `src/layouts/MobileLayout.tsx` 约 361 行 | 与桌面同构的内联 grid |
| 放大查看 | `src/components/PatternZoomView.tsx` → `EditablePatternGrid`（只读） | 手机端和桌面端共用 |
| 导出 PNG | `src/App.tsx` `buildPatternExportCanvas()` | Canvas 逐格 `fillRect`，另画 10×10 辅助线与色号 |

编辑模式走 `PatternEditor` → `EditablePatternGrid`，直接改 `pattern`，不在镜像范围内。

目前没有任何镜像逻辑；`renderMode` 等显示设置没有做 `localStorage` 持久化。

### 1.2 AI 服务端

`server/agnes-proxy.mjs`（本地开发）和 `functions/api/agnes/generate.js`（Cloudflare Pages Function）各自维护一份几乎相同的 `callAgnes` / `callAgnesMany`：

- 只读一套配置 `AGNES_API_KEY / AGNES_API_BASE / AGNES_MODEL`。
- 单次调用失败直接抛错 → 502 给前端；`count > 1` 时用 `Promise.allSettled`，全部失败才报错。
- 两份代码已漂移：proxy 有 360s `AbortController` 超时，Pages Function 没有。
- 前端 `src/agnes/client.ts` 请求 `/api/agnes/generate`，客户端超时 360s。

---

## 2. 设计原则

- 镜像是**显示层变换**：不改 `pattern` 数据、不进撤销历史、不影响色号统计。通过翻转单元格顺序实现，不用 CSS `scaleX(-1)`，否则色号文字会跟着镜像。
- 服务端两条路径共享同一份 provider / fallback 代码，HTTP 层只做解析与响应。
- 不配置 fallback 时行为与现在完全一致；旧的 `AGNES_*` 变量继续生效，线上部署不需要立刻改配置。
- verify 脚本依赖的类名（`.pattern-grid`、`.legend-item`、`.paper-overview`、`.result-summary`、`.section-title`）保持不变。

---

## 3. 分阶段任务

### Phase A：镜像开关（0.5 天）

1. `src/pattern/ops.ts` 新增纯函数：

   ```ts
   export function mirrorPatternHorizontal(pattern: BeadCell[][]): BeadCell[][]
   ```

   每一行 `[...row].reverse()`，返回新数组，不修改入参。

2. `src/App.tsx`
   - 新增 `const [mirrored, setMirrored] = useState(false)`，默认关闭，不持久化（与 `renderMode` 保持一致）。
   - 新增 `const displayPattern = useMemo(() => mirrored ? mirrorPatternHorizontal(pattern) : pattern, [pattern, mirrored])`。
   - `renderGrid()`、`PatternZoomView`、`buildPatternExportCanvas` 的入参改为 `displayPattern`。`PatternEditor` 继续传 `pattern`。
   - 导出 PNG 的副标题在 `mirrored` 时追加 ` · 镜像`，让成品图可辨认。
   - 进入编辑模式时若 `mirrored === true`，在编辑器顶部显示一行提示"编辑模式显示原图，镜像仅影响预览与导出"。
3. `src/layouts/MobileLayout.tsx`
   - 新增 props `displayPattern`、`mirrored`、`setMirrored`；整体图纸与 `PatternZoomView` 改用 `displayPattern`。
4. UI
   - 桌面侧栏：在"显示模式"分段控件下方加一个开关行 `镜像显示`（复用现有 `label` + `segmented` 样式，或一个 `role="switch"` 按钮）。
   - 手机端：在"色号 / 纯色"切换同一行右侧加同样的开关。
   - 开关在 `pattern.length === 0` 时禁用。
5. 埋点（`src/analytics.ts` 的 `track`）
   - 新增事件 `mirror_toggled`，属性 `{ mirrored: boolean }`。
   - `pattern_exported` / `pattern_export_failed` / `print_clicked` 的属性增加 `mirrored`。
6. 打印：`window.print()` 打印的是当前 DOM，自然跟随 `displayPattern`，无需额外处理。

验收：

- 打开开关后，整体图纸第一行首尾单元格的背景色互换；色号文字方向正常。
- 图例 `.legend-item` 数量与数值不变。
- 导出 PNG 的格子与预览一致，副标题含"镜像"。
- 进入编辑模式看到原图；退出后预览仍为镜像。
- 新增 `verify-mirror.mjs`：上传固定图 → 读取 `.pattern-grid span` 第一行首尾背景色 → 点击开关 → 再次读取并断言互换 → 断言 `.legend-item` 数量不变。

### Phase B：服务端 provider 抽象与代码收敛（0.5 天）

目标：把两份重复的调用逻辑合并到一个共享模块，先不改行为。

1. 新建 `server/ai/`（纯 ESM，无 Node 专属 API，便于 Pages Function 打包）：

   ```
   server/ai/
     types.mjs            # JSDoc 类型：ProviderConfig / GenerateRequest / GenerateResult
     config.mjs           # 从 env 对象解析 default / fallback 两组 ProviderConfig
     providers/
       openaiImages.mjs   # 现有 Agnes 调用方式（OpenAI images 兼容）
     index.mjs            # createProvider(config)、generateImage(req, { default, fallback })
   ```

   ```js
   // types.mjs（JSDoc）
   /** @typedef {{ kind: 'openai-images', apiKey: string, apiBase: string, model: string, timeoutMs: number }} ProviderConfig */
   /** @typedef {{ prompt: string, size: string, ratio?: string, imageDataUri?: string, effectImageDataUri?: string }} GenerateRequest */
   /** @typedef {{ imageBase64?: string, imageUrl?: string, mimeType: string }} GenerateResult */
   ```

   provider 适配器统一签名：`async function generate(request, config, signal): Promise<GenerateResult>`。新增协议只需在 `providers/` 加一个文件并在 `createProvider` 的 `switch (config.kind)` 里登记。

2. `openaiImages.mjs` 搬入现有 `callAgnes` 的请求体构造与响应解析；超时由调用方通过 `AbortSignal` 传入。错误统一抛 `ProviderError { provider, status, message }`，便于后面聚合。

3. `server/agnes-proxy.mjs` 与 `functions/api/agnes/generate.js`：删除各自的 `callAgnes` / `callAgnesMany`，改为

   ```js
   import { generateImages } from '../../../server/ai/index.mjs'   // Pages Function
   import { generateImages } from './ai/index.mjs'                  // Node proxy
   ```

   `generateImages({ request, count, providers })` 负责 `count` 并发与 fallback。

4. 每次尝试独立 `AbortController` 超时，默认 150s（`timeoutMs`），保证 default + fallback 串行总时长 < 前端 360s。

验收：

- `.env` 只配旧的 `AGNES_*`，`npm run dev` + `npm run dev:proxy` 生成一次 AI 图，结果与改造前一致。
- `npm run pages:dev` 启动成功、`GET /api/agnes/generate` 返回 `ok: true`，POST 一次能出图（确认 wrangler 能打包 `server/ai` 的相对导入）。

### Phase C：fallback 策略（0.5 天）

1. `index.mjs` 的 `generateOnce(request, providers)`：

   ```
   try default
   catch (err1):
     if (!fallback) throw err1
     try fallback → 结果标记 provider: 'fallback'
     catch (err2): throw AggregateError-like，message 合并两次原因：
       "默认模型失败：<err1.message>；备用模型失败：<err2.message>"
   ```

   任何异常（含 400/401/403、超时、无图片）都走 fallback，按已确认决策不做分类。

2. `count > 1` 时每张图独立执行 `generateOnce`，部分成功即返回成功的图；全部失败才报错。

3. 响应体新增：

   ```json
   { "imageBase64": "...", "provider": "default" | "fallback", "images": [{ "...", "provider": "..." }] }
   ```

4. 前端 `src/agnes/client.ts`
   - `AgnesGenerateResponse` 增加 `provider?: 'default' | 'fallback'`。
   - `generateAgnesImages` 返回值从 `File[]` 改为 `{ files: File[], usedFallback: boolean }`（或在 `File` 旁返回元信息），调用点 `App.tsx` 同步调整。
   - 上报 `ai_generate_fallback_used`；AI 结果区在 `usedFallback` 时显示小字"本次已切换备用模型"。

5. 日志：服务端每次 fallback 触发 `console.warn('[ai] fallback', { reason, model })`，Cloudflare 日志里可查。

验收：

- `AI_DEFAULT_API_BASE` 指向错误地址、fallback 正常：出图成功，响应 `provider: 'fallback'`，页面出现提示。
- 两个都指错：前端错误文案同时包含两段原因。
- 不配 fallback、default 失败：错误文案与现在一致。

### Phase D：环境变量独立配置（0.5 天）

1. 新变量（`server/ai/config.mjs` 解析）：

   ```
   # 默认模型
   AI_DEFAULT_PROVIDER=openai-images
   AI_DEFAULT_API_KEY=
   AI_DEFAULT_API_BASE=https://apihub.agnes-ai.com/v1/images/generations
   AI_DEFAULT_MODEL=agnes-image-2.1-flash
   AI_DEFAULT_TIMEOUT_MS=150000

   # 备用模型（AI_FALLBACK_API_KEY 留空即不启用 fallback）
   AI_FALLBACK_PROVIDER=openai-images
   AI_FALLBACK_API_KEY=
   AI_FALLBACK_API_BASE=
   AI_FALLBACK_MODEL=
   AI_FALLBACK_TIMEOUT_MS=150000
   ```

2. 兼容规则：`AI_DEFAULT_API_KEY / API_BASE / MODEL` 未设置时分别回退到 `AGNES_API_KEY / AGNES_API_BASE / AGNES_MODEL`；都没有时才报"请先配置 API Key"。fallback 必须显式配置 `AI_FALLBACK_API_KEY` 才启用，其余字段缺省继承 default 的同名值（方便"同一厂商换模型"的场景）。

3. `config.mjs` 对 `PROVIDER` 做白名单校验，未知值启动时抛明确错误。

4. `GET /api/agnes/generate` 健康检查扩展为：

   ```json
   { "ok": true, "default": { "kind": "openai-images", "model": "..." }, "fallback": { "kind": "...", "model": "..." } | null }
   ```

   不返回 key 与 base URL。

5. 文档同步：`.env.example`、`.dev.vars.example`、`README.md`（部署章节）、`CLAUDE.md`（AI generation 一节）。

验收：

- 只配旧变量 / 只配新变量 / 新旧混配 三种情况都能出图，健康检查显示正确的 model。
- `AI_DEFAULT_PROVIDER=foo` 时 proxy 启动报错、Pages Function 返回 500 并带明确文案。

---

## 4. 涉及文件

| 文件 | 变更 |
|---|---|
| `src/pattern/ops.ts` | 新增 `mirrorPatternHorizontal` |
| `src/App.tsx` | `mirrored` state、`displayPattern`、开关 UI、导出副标题、埋点、`generateAgnesImages` 返回值适配 |
| `src/layouts/MobileLayout.tsx` | 新 props，手机端开关 |
| `src/agnes/client.ts` | 响应类型与返回值增加 provider 信息 |
| `src/analytics.ts` | 无结构改动，仅新增事件名使用 |
| `server/ai/*`（新） | provider 抽象、fallback、配置解析 |
| `server/agnes-proxy.mjs` | 删除内联调用逻辑，改用 `server/ai` |
| `functions/api/agnes/generate.js` | 同上；健康检查扩展 |
| `.env.example`、`.dev.vars.example`、`README.md`、`CLAUDE.md` | 新变量说明 |
| `verify-mirror.mjs`（新） | 镜像端到端验证 |

---

## 5. 风险与处理

| 风险 | 处理 |
|---|---|
| wrangler 打包 Pages Function 时无法解析 `../../../server/ai` | Phase B 第一步先用 `npm run pages:dev` 验证；若失败，把 `server/ai` 移到 `functions/api/agnes/_ai/`（无 `onRequest` 导出的文件不会成为可用路由），Node proxy 反向引用它 |
| default 与 fallback 串行后总时长超过 Cloudflare / 前端超时 | 每次尝试 150s 上限；若线上观察到 fallback 阶段常被掐断，再把 `AI_DEFAULT_TIMEOUT_MS` 调小 |
| 任何失败都切 fallback，会掩盖 default 的配置错误 | 服务端 `console.warn` 记录每次 fallback 原因；健康检查暴露 model 名；PostHog `ai_generate_fallback_used` 可看占比 |
| 镜像后用户在编辑模式看到的是原图，可能困惑 | 编辑器顶部提示文案；导出图副标题标"镜像" |
| 大图翻转的性能 | `useMemo` 只在 `pattern` 或 `mirrored` 变化时重算；200×200 规模下 `reverse` 可忽略 |

---

## 6. 顺序与依赖

```
Phase A（镜像）──────────────────────────────┐
                                               ├─ 全部完成后统一跑 verify + build + lint
Phase B（抽象收敛）→ Phase C（fallback）→ Phase D（环境变量）┘
```

A 与 B/C/D 相互独立，可并行或任意先后。B 必须先于 C、D。总工期约 2 天。

---

## 7. 验证方式

- `npm run build`、`npm run lint` 通过。
- 启动 `npm run dev`，依次运行 `node verify-layout.mjs`、`node verify-mirror.mjs`、`node verify-preview-consistency.mjs`、`node verify-export-feedback.mjs`。
- 本地 proxy：按第 3 节 Phase C / D 的验收项，用错误的 `API_BASE` 分别模拟 default 失败、双失败、无 fallback 三种情况。
- `npm run pages:dev` 跑一遍 Cloudflare 路径，确认导入打包与健康检查输出。
