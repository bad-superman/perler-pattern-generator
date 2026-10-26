# 拼豆图纸生成效果优化计划

更新时间：2026-10-25

本计划汇总两次讨论的结论：一是本地量化链路（图片 → 拼豆图纸）效果不理想，二是 AI 生成链路（参考图 → Agnes 像素画 → 量化）提示词冗余且效果不稳定。两条链路最终都汇入 `generatePattern()`，因此量化质量是基础，AI 侧的优化建立在其上。

---

## 1. 目标

| 目标 | 可衡量的表现 |
|---|---|
| 配色更接近人眼感知 | 肤色、深色区域、相近浅色不再明显映错；同一张图在 MARD / Hama 下结果都合理 |
| 颜色配额用在刀刃上 | 面积小但关键的颜色（眼睛、高光、Logo 点缀色）得以保留；相近色不再重复占配额 |
| 轮廓清晰、少孤立豆 | 细线条不丢失、边缘不发灰；孤立单颗豆明显减少 |
| AI 风格可控、输出稳定 | prompt 长度减半以上；像素块与图纸网格对齐，不出现半格色；一次生成可挑选 |
| 可验证 | 每一项改动都能用固定样张做前后对比，而不是凭感觉 |

---

## 2. 现状诊断汇总

### 2.1 量化链路（`src/App.tsx`）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| Q1 | 最近色用 RGB 欧氏距离，每像素重复 `hexToRgb` 解析 221 次 | `nearestPaletteColor` | 配色与感知不符；性能浪费 |
| Q2 | 选色 = 按出现频率截断前 N | `generatePattern` 频率统计段 | 小面积关键色被丢；相近色挤占配额 |
| Q3 | 无抖动 | — | 渐变 / 阴影区域生硬色带 |
| Q4 | 网格 > 48 时直接 `drawImage` 缩放，≤ 48 时 4×4 均值 | `getSamplingScale` / `drawImageToSampledGrid` | 细线随机丢失；均值使边缘发灰 |
| Q5 | 无孤立点清理 | — | 实拼时大量单颗豆 |
| Q6 | 背景只认 alpha < 80 | `generatePattern` | 白底 JPG 背景全部变白豆并占最大配额 |
| Q7 | `cropSubject.ts` 只认近白背景 | `isBackgroundPixel` | 深色背景的 AI 图不裁切 |

### 2.2 AI 链路（`src/agnes/`、`server/`、`functions/`）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| A1 | prompt 约 700–900 汉字，构图 / 硬边缘等要求重复 2–3 次 | `AGNES_BASE_PROMPT`、各预设、最终输出要求 | 有效信息被稀释 |
| A2 | 要求模型输出"横向 N 个像素格"、"最多 N 色" | `buildPixelSpecPrompt` | 模型做不到，浪费约 1/3 篇幅，还把模型推向"碎方块" |
| A3 | 负面词以"负面提示词：不要…"拼进正向 prompt；全文十余处"不要 / 无 / 避免" | `buildAgnesPrompt` 末尾 | 否定表达效果差 |
| A4 | 六个预设中四个几乎同义；预设里混入构图要求 | `AGNES_STYLE_PRESETS` | 用户感知不到风格差异；与基础提示打架 |
| A5 | 中文长 prompt | 全部 | 待 A/B 验证是否不如英文 |
| A6 | 参考图原样上传，无预处理 | `generateWithAi` | 构图、主体占比全靠 prompt "求"模型 |
| A7 | 一次只出一张 | `generateWithAi` / proxy | 随机性大，用户只能重来 |
| A8 | 让模型负责像素化 | 整体分工 | 块大小不一、带抗锯齿，与图纸网格错位 |
| A9 | `sharpQuantize` 只关掉平滑，未对齐像素块 | `drawImageToSampledGrid` | AI 模式仍出现半格色 |

### 2.3 Agnes API 的硬约束（已核对官方文档）

`POST /v1/images/generations` 仅支持：`model`、`prompt`、`size`（推荐 `1K`–`4K` 档位）、`ratio`、`extra_body.image[]`、`extra_body.response_format`、`return_base64`。

- **没有** `strength` / `guidance` / `seed` / `negative_prompt` / `n`。前一轮讨论中"暴露 strength 滑块"不可行；去噪强度只能靠 prompt 措辞和参考图预处理间接控制。
- 它是指令式编辑模型（官方 img2img 结构：`[要改什么] + [新风格] + [增删元素] + [要保留什么]`），"remove the background" 这类**动作指令**比"不要背景"这类否定更有效。
- 模型官方定位是"高信息密度、复杂细节"，与拼豆需要的"极简大色块"方向相反。这解释了为什么效果不稳定，也意味着 prompt 必须把"简化"放在最前面，并用预处理后的参考图把结构先验给足。
- 多候选只能靠并行多次请求实现（当前所有档位免费）。
- `size` 建议改用 `1K` + `ratio`，避免 `1024x768` 被归一化到非预期尺寸。

### 2.4 历史背景

`doc/ai-prompt-pipeline-v2-dev-plan.md` 曾规划 Vision 分析 → Prompt Builder 的 V2 链路，后已从代码中移除（见 `doc/current-ai-prompts.md`）。本计划**不重新引入 Vision 分析步骤**，所有改进都是确定性的本地算法或 prompt 结构调整，不增加额外模型调用和失败点。

---

## 3. 总体策略

1. **重新分工**：模型只负责"风格 + 简化"（扁平、粗轮廓、无渐变、主体突出），**像素化、配色、网格对齐全部由本地代码完成**。像素化是代码能做到 100% 精确的事。
2. **先把量化做对**：量化是两条链路的共同终点，Phase 1 的收益对本地模式和 AI 模式同时生效。
3. **先建评测再改算法**：没有固定样张和对比截图，"效果不理想"无法收敛。
4. **渐进、可回退**：每一项新能力默认值尽量与现状一致或作为可选开关，verify 脚本依赖的类名不变。
5. **把量化逻辑从 `App.tsx` 抽出**：当前 1355 行单文件不利于迭代；抽成纯函数模块后才能做单元测试和离线评测。

---

## 4. 分阶段计划

### Phase 0：评测基线

目标：让每次改动都能"前后对比"。

任务：

1. 建立样张集（放在 `doc/samples/` 或仓库外固定目录，由环境变量指定）：
   - 人像（有肤色、渐变）
   - 宠物 / 毛发
   - Logo / 文字（高对比、细线）
   - 风景（大面积渐变）
   - 复杂背景照片
   - 已有像素画（验证对齐）
2. 新增 `scripts/eval-quantize.mjs`（Node，复用量化纯函数，见 Phase 1 的模块抽取）：对样张集按 32 / 48 / 64 网格、12 / 24 色批量生成图纸，输出：
   - 量化结果 PNG（复用 `exportPng` 的绘制逻辑或简化版）
   - 指标：与降采样原图的平均 ΔE、孤立豆数量、实际使用颜色数
   - 一个 HTML 对比页（旧 / 新并排）
3. Debug 模式增强（`?debug=1` 已存在）：
   - 在 AI 面板同时显示：原始参考图 → 预处理后参考图 → AI 原图 → 对齐 / 裁切后 → 量化结果
   - 显示最终 prompt 字数与各槽位内容
   - 一键下载本次所有中间产物

涉及文件：`scripts/`（新增）、`src/App.tsx`（debug 面板）。

验收：对同一样张集，能一条命令产出旧算法基线；后续每个 Phase 都附对比截图。

### Phase 1：量化核心（收益最大，优先）

目标：解决 Q1、Q2、Q4。

任务：

1. **模块抽取**：新建 `src/quantize/`
   - `color.ts`：`hexToRgb`、`rgbToLab`（sRGB → XYZ → CIELAB，D65）、`deltaE`（先 CIE76，接口预留 CIEDE2000）
   - `palette.ts`：`preparePalette(brand)` 预计算每个色号的 Lab，缓存；`nearestPaletteColor` 改为 Lab 距离
   - `sample.ts`：`drawImageToSampledGrid` 及其依赖
   - `select.ts`：选色策略
   - `App.tsx` 只保留调用，行为先保持一致（本步不改效果，仅重构 + 跑 verify）
2. **Lab 最近色**：替换 RGB 欧氏距离。预计算后每像素只做 N 次减法平方，性能优于现状。
3. **k-means 选色**替代频率截断：
   - 在 Lab 空间对有效像素做 k-means（k = maxColors，k-means++ 初始化，迭代 ≤ 20 次，像素多时先随机抽样 ≤ 20k 个点）
   - 每个聚类中心映射到最近的豆子色号；去重后不足 k 个时，用"离已选色最远的高频色"补足
   - 可选权重：像素与 3×3 邻域均值 ΔE 大的（边缘 / 点睛色）权重 ×2，防止小面积关键色被吞
   - 最终仍对全图按已选色号重映射，保证计数与渲染一致（现有逻辑）
4. **统一超采样**：
   - 不再按网格大小切换；所有尺寸固定每格 3×3（> 96 格时 2×2）超采样
   - 每格先统计 9 个采样点在 Lab 下的离散度：离散度小（纯色区）取均值；离散度大（边缘）取众数所属采样点的颜色，保边缘不发灰
   - `sharpQuantize` 语义改为"边缘优先取众数"，而不是关掉平滑

涉及文件：`src/quantize/*`（新增）、`src/App.tsx`、`src/palettes/index.ts`（导出预计算接口）。

验收：

- `npm run build`、`npm run lint` 通过；所有 `verify-*.mjs` 通过
- 评测脚本：平均 ΔE 相比基线下降；Logo 样张的细线保留；人像肤色不再映成灰 / 粉
- 可选：引入 `vitest` 为 `color.ts` / `select.ts` 写单元测试（Lab 转换已知值、k-means 收敛、去重补色）。属于新增依赖，需确认。

风险：k-means 结果带随机性 → 固定随机种子（简单 LCG），保证同图同参数结果可复现。

### Phase 2：后处理与可选开关

目标：解决 Q3、Q5、Q6、Q7。全部为可选项，默认值不改变现有输出，除非评测明确更好。

任务：

1. **背景抠除**（本地模式默认开、可关）：
   - 取四角 + 四边中点共 8 个采样色，若其中 ≥ 5 个在 ΔE < 6 内一致，判定为背景色
   - 与背景色 ΔE < 阈值（默认 10）且与边框连通（flood fill）的像素置为空格（`colorIndex: -1`）
   - 同一函数复用到 `cropSubject.ts`，替换 `isBackgroundPixel` 的近白判定，解决深色背景不裁切
2. **抖动**（默认关；选项：关 / 弱 / 中）：
   - 弱：Bayer 4×4 有序抖动，仅在像素与所选色 ΔE > 阈值时参与
   - 中：Floyd–Steinberg，误差扩散系数 ×0.5，防噪
   - 对拼豆场景只推荐"弱"
3. **孤立豆清理**（默认开、可关，强度 1–2 轮）：
   - 若一格四邻中 ≥ 3 格同色，且本格与该色 ΔE < 阈值，并入
   - 清理后重新计算 palette 计数（复用 `recalculatePaletteCounts`）
4. 侧边栏新增一个"高级"折叠区放这三个开关，任一变化触发 `regenerate`

涉及文件：`src/quantize/postprocess.ts`（新增）、`src/agnes/cropSubject.ts`、`src/App.tsx`、`src/App.css`。

验收：评测脚本输出"孤立豆数量"显著下降；白底 JPG 样张背景变空格且不再占配额；深色背景 AI 样张被正确裁切；verify 脚本通过。

### Phase 3：AI prompt 重构

目标：解决 A1–A5。

任务：

1. 重写 `src/agnes/styles.ts` 为**四槽位结构**，总长控制在 80–120 英文单词：

   ```text
   [subject]     Keep the main subject, pose and key identifying features of the first reference image.
   [style]       <预设的唯一职责，一句话>
   [user]        <用户自定义 aiPrompt，紧跟风格之后>
   [rendering]   Flat cel-shaded illustration, bold clean outlines, solid color fills, very limited palette,
                 no gradients, no texture, no shadows. Remove the background and replace it with a single plain color.
   [composition] Center the subject and make it fill most of the frame with a tight crop.
   ```

   - 依据 Agnes 官方 img2img 结构，否定项改成动作："Remove the background…"、"Replace gradients with flat fills"
   - `gridSize` 只映射为简化等级，不再写像素数：
     - ≤ 32：`icon-level simplification, no facial details, silhouette and 2–3 key features only`
     - ≤ 56：`simplified features, large shapes`
     - 其他：不加
   - `maxColors` 不进 prompt；或只保留 `two-tone shading at most`
   - 效果参考图说明改为官方多图结构：`Use the first image as the subject reference and the second only as the style reference…`
2. **风格预设精简为 4 个**可区分的：
   - Q 版可爱（chibi、大头、pastel）
   - 复古游戏精灵（这里才允许 pixel sprite 措辞）
   - 扁平图标（极简几何）
   - 写实简化（保留轮廓与比例）
   - 旧 id 做映射，避免用户 URL / 本地存储失效
3. **语言 A/B**：同一槽位结构准备中 / 英两版，Phase 0 的 debug 面板支持切换，用样张集跑 2 × 4 预设对比后定稿。
4. `pickAgnesSize` 改为返回 `{ size: '1K', ratio }`，proxy / Pages Function 透传 `ratio`。

涉及文件：`src/agnes/styles.ts`、`src/agnes/client.ts`、`server/agnes-proxy.mjs`、`functions/api/agnes/generate.js`、`doc/current-ai-prompts.md`（同步更新）。

验收：prompt 长度 ≤ 现状 50%；4 个预设在同一样张上肉眼可区分；无 "不要 / 无 / 避免" 式否定句；`?debug=1` 可看到完整 prompt。

### Phase 4：参考图预处理与多候选

目标：解决 A6、A7，用确定性手段替代 prompt "求"模型。

任务：

1. **上传前预处理**（`src/agnes/prepareReference.ts`，新增）：
   - 自动主体裁切：复用 Phase 2 的背景判定做包围盒，留 5% 边距；无法判定时不裁
   - 按 `ratio` 居中裁到目标比例
   - 可选 **预像素化**：把参考图降采样到 `cols × rows` 再最近邻放大回 1024，作为 `image[0]`。给模型"大色块"结构先验，对冲其"高信息密度"倾向。效果需在 Phase 0 评测中验证，验证通过才默认开启。
   - 提供手动裁剪框（可后置，先做自动）
2. **多候选**：
   - proxy / Pages Function 增加 `count` 参数（1–4），服务端并行发起 N 次请求，返回数组；单张失败不影响其余
   - 前端新增候选缩略图行，点击切换后走 `cropSubject → generatePattern`；默认选第一张
   - Cloudflare Function 注意并发请求的超时（单次 ≤ 360s，`Promise.allSettled`）
3. debug 面板展示预处理前后参考图。

涉及文件：`src/agnes/prepareReference.ts`（新增）、`src/agnes/client.ts`、`server/agnes-proxy.mjs`、`functions/api/agnes/generate.js`、`src/App.tsx`、`src/App.css`。

验收：主体占比不再依赖 prompt；一次生成可挑选 2–4 张；并行失败有降级。

### Phase 5：像素块检测与网格对齐（AI 模式）

目标：解决 A8、A9。

任务：

1. `src/quantize/detectPixelGrid.ts`（新增）：
   - 对 AI 原图逐行 / 逐列计算相邻像素 ΔE，得到边缘位置序列
   - 对边缘位置做自相关 / 直方图求周期 p 及相位偏移；一致性低于阈值则判定"非规则像素画"
   - 返回 `{ cellSize, offsetX, offsetY, confidence }`
2. `drawImageToSampledGrid` 增加对齐分支：confidence 高时按检测到的格心采样（每格取中心 3×3 众数），再映射到目标 `cols × rows`；低时回退 Phase 1 的超采样
3. 如果 Phase 4 的预像素化已默认开启，这里的检测成功率会显著提高；两者配合使用。

涉及文件：`src/quantize/detectPixelGrid.ts`（新增）、`src/quantize/sample.ts`、`src/App.tsx`。

验收："已有像素画"样张在任意 gridSize 下不出现半格色；AI 原图检测命中率在样张集上 ≥ 70%。

---

## 5. UI 变更清单

| 位置 | 变更 | Phase |
|---|---|---|
| 侧边栏 → 高级（新折叠区） | 背景抠除开关、抖动（关 / 弱 / 中）、孤立豆清理开关 | 2 |
| AI 面板 → 风格 | 6 预设 → 4 预设 | 3 |
| AI 面板 | 候选数量（1–4）、候选缩略图行 | 4 |
| AI 面板 | 预像素化参考图开关（默认值依评测） | 4 |
| Debug 面板 | 中间产物链、prompt 槽位与字数、中 / 英切换、一键下载 | 0 / 3 |

`.pattern-grid`、`.legend-item`、`.paper-overview`、`.result-summary`、`.section-title` 等 verify 脚本依赖的类名不变。

---

## 6. 验证方式

每个 Phase 结束：

1. `npm run lint` && `npm run build`
2. 启动 dev server，运行全部 `verify-*.mjs`（布局 / 编辑 / 导出 / 预览一致性）
3. 运行 `scripts/eval-quantize.mjs`，把对比 HTML 与指标截图附到 PR
4. AI 相关 Phase 额外：用样张集跑 4 预设 × 2 语言（Phase 3）或 有 / 无预像素化（Phase 4），保存 AI 原图与量化结果

---

## 7. 暂缓 / 不做

- 不重新引入 Vision 分析 API（见 2.4）
- 不换图像模型；Agnes 2.1 Flash 当前免费，先在其约束内把确定性部分做好
- 不做 CIEDE2000（CIE76 够用，接口预留）
- 不做 Logo 保真专用路径（与历史产品决策一致）
- 手动裁剪框、自动重生成放到 Phase 4 之后视需要再做

---

## 8. 推荐顺序与依赖

```text
Phase 0 评测基线 ──┐
                   ├─→ Phase 1 量化核心 ─→ Phase 2 后处理
                   │                          │
                   └─→ Phase 3 prompt 重构 ───┤
                                              ├─→ Phase 4 预处理 + 多候选 ─→ Phase 5 网格对齐
                                              │
            (Phase 2 的背景判定被 Phase 4 复用) ┘
```

- Phase 1 与 Phase 3 相互独立，可并行；但 Phase 1 对两条链路都有收益，优先级更高。
- Phase 4 的预像素化、Phase 5 的网格对齐都依赖 Phase 1 抽出的采样模块。
- 最小可交付集：Phase 0 + Phase 1 + Phase 3。

---

## 9. 2026-10-25 实施记录

已落地：

- `src/quantize/`：CIELAB 最近色、固定种子 k-means 选色、3×3 / 2×2 自适应采样、去背景、孤立豆清理、抖动、像素网格检测
- 侧边栏「高级量化」：去背景、清理孤立豆、抖动（关 / 弱 / 中）
- AI 提示词改为四段式英文短 prompt，风格减到 4 个；请求改为 `1K` + `ratio`；上传前裁切主体；支持 1–4 张候选
- `scripts/eval-quantize.mjs` 与 `doc/samples/` 五张对照图

同一套图、48 格、最多 12 色的对照：

| 样张 | 旧豆数 / 色数 / 孤立点 | 新豆数 / 色数 / 孤立点 |
|---|---|---|
| logo | 1776 / 12 / 209 | 439 / 5 / 2 |
| portrait | 2688 / 12 / 79 | 944 / 8 / 4 |
| gradient | 1440 / 5 / 0 | 1440 / 3 / 0 |
| pixel | 2304 / 6 / 8 | 720 / 3 / 1 |
| dark-subject | 2304 / 12 / 50 | 453 / 2 / 0 |

渐变图在关闭抖动时色阶更少。打开「中」抖动后，色带交界会用相邻色号交错。Agnes 实图生成在 2026-10-25 23:14（UTC+8）返回 `image queue is full`，提示词已送达，成图未取回。
