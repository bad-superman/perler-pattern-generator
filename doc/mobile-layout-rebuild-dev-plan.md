# 手机端布局重建开发计划

更新时间：2026-10-26

承接 `doc/mobile-ux-and-ai-framing-dev-plan.md`。上一轮把手机端规则叠在桌面 DOM 上（`display: contents`、`order`、局部 sticky、`desktop-only !important`），线上 `b9cd5eb` 出现了模式切换胶囊浮在上传卡上、两个上传入口叠放、结果卡头部五个胶囊、图纸上下大片空白、AI 卡五屏长等问题，桌面端头部和侧栏也被带坏。本计划把手机端改成独立骨架，桌面端恢复到可用状态，并统一视觉。

---

## 1. 目标与验收数值（iPhone 13，390×844，视口高 664px）

| 项目 | 线上现状 | 目标 |
|---|---|---|
| 顶部到上传卡顶部 | 约 200px（hero 卡 + 重复按钮） | ≤ 72px（仅 AppBar） |
| 上传卡底部到结果卡顶部 | 27px | ≤ 24px，且中间无其它元素 |
| 结果卡顶部到图纸顶部 | 215px（头部 + 胶囊 + 数字块 + 纸张留白） | ≤ 120px |
| 图纸上下留白 | 约 150px | ≤ 16px |
| AI 卡高度 | 约 5 个视口 | ≤ 1.5 个视口（默认折叠态） |
| 空页总高 / 生成后总高 | 1946px / 2552px | ≤ 1400px / ≤ 2000px |
| 桌面端结果卡头部控件 | 5 个胶囊 | 2 个（预览 / 编辑） |
| 桌面端侧栏一级项 | 色卡被藏进折叠 | 色卡回到一级 |

---

## 2. 设计原则

1. 手机端（≤ 620px）和桌面端各自一套布局组件，共享同一份状态与回调；不再靠 CSS 重排桌面 DOM。
2. 每屏只有一个紫色主按钮；一级切换黑底白字，二级切换浅紫填充。
3. 卡片统一 20px 圆角、1px 边框、无阴影；手机端左右边距 12px、卡片间距 12px。
4. 桌面端 verify 脚本依赖的类名（`.pattern-grid`、`.legend-item`、`.paper-overview`、`.result-summary`、`.section-title`）在桌面布局中保留；手机端布局用自己的类名，`scripts/measure-mobile.mjs` 单独覆盖。
5. 字号：手机端标题 20px，卡片标题 16px，正文 14px，辅助 12px。

---

## 3. 状态抽取

新增 `src/hooks/usePatternWorkspace.ts`，把 `App.tsx` 里的状态、`generatePattern`、`regenerate`、`generateWithAi`、`exportPng`、编辑相关回调全部收进去，返回一个 `workspace` 对象。`App.tsx` 只剩：

```tsx
const workspace = usePatternWorkspace()
const isMobile = useMediaQuery('(max-width: 620px)')
return isMobile ? <MobileLayout {...workspace} /> : <DesktopLayout {...workspace} />
```

`workspace` 对象按用途分组，避免上百个散 props：

```ts
interface Workspace {
  source: { mode, setMode, sourceName, sourcePreview, uploadRef, effectReferenceRef, handleFile, ... }
  ai: { styleId, setStyleId, prompt, setPrompt, framing, setFraming, candidateCount, setCandidateCount,
        candidates, candidateIndex, applyCandidate, generate, isGenerating, stage }
  settings: { gridSize, setGridSize, maxColors, setMaxColors, shape, setShape, paletteBrand, switchPaletteBrand,
              removeBackground, cleanupIsolated, dither, updateQuantize, regenerate }
  result: { pattern, palette, gridCols, gridRows, activeCells, renderMode, setRenderMode, paperScale, ... }
  editor: { previewMode, enterEditMode, exitEditMode, tool, ..., canUndo, canRedo, undo, redo }
  exportApi: { exportPng, isExporting, exportSheetUrl, closeExportSheet, notice }
  board: { rowsInput, setRowsInput, create, confirmPending, cancelConfirm }
  status: { isProcessing, error }
}
```

这一步不改任何 UI，完成后桌面端 verify 脚本必须全绿。

---

## 4. 分阶段任务

### Step 1：状态抽取 + 桌面端恢复（0.5 天）

1. 新建 `usePatternWorkspace.ts`，把 `App.tsx` 瘦到 ≤ 150 行。
2. 新建 `src/layouts/DesktopLayout.tsx`，内容来自现有 JSX，并做以下恢复：
   - 结果卡头部只保留"预览 / 编辑"两个胶囊；"色号图纸 / 纯色预览"回到侧栏。
   - 色卡品牌回到侧栏一级；"更多设置"只放形状 + 高级量化，summary 加右箭头图标。
   - 撤销 / 重做仅在 `canUndo || canRedo` 时渲染。
   - 删除"放大"按钮和 `PatternZoomView` 在桌面端的引用。
3. 删除 `App.css` 中 620px 断点下的 `display: contents`、`order`、`.desktop-only`、`.source-block / .settings-block` 相关规则，以及 `.hero-section { display: contents }`。

验收：`verify-layout.mjs`、`verify-preview-fit.mjs`、`verify-paper-overview.mjs`、`verify-no-compare-modal.mjs`、`verify-preview-consistency.mjs` 通过；桌面截图与 `96224c3` 时期一致（头部两个胶囊、侧栏结构相同）。

### Step 2：手机端骨架（0.5 天）

新建 `src/layouts/MobileLayout.tsx` 与 `src/components/mobile/`：

1. `AppBar.tsx`：56px，`position: sticky; top: 0`，白底 + 下边线；左侧标题"拼豆图纸"，右侧三段式模式切换（黑底白字）。整条栏 sticky，不是胶囊 sticky。
2. `SourceCard.tsx`：
   - 本地模式：上传卡（148px 高，虚线边框，整块可点，缩略图 + 文件名），是唯一选图入口；上传卡下方放全宽主色“生成图纸”按钮，未选图时禁用，选图后可点击生成。选图后仍自动生成一次。有结果后该按钮隐藏，重新生成由底部操作栏承担。
   - 三种模式的来源卡底部都是同一位置、同一样式的主按钮：本地“生成图纸”、AI“AI 生成拼豆图”、画板“创建画板”。所有按钮（卡内与底部栏）共用同一组件：44px 高、14px 圆角。
   - 画板模式：高度 chip + 创建按钮 + 行内确认。
   - AI 模式：见 Step 4，本步先原样搬入。
3. `ResultCard.tsx`：本步先搬入现有结构，Step 3 重做。
4. `SettingsCard.tsx`：本步先搬入现有控件，Step 4 重做。
5. `IntroCard.tsx`：介绍轮播 + 单行推广，放在参数卡之后。
6. `MobileActionBar.tsx`：固定底部，与卡片同规格——左右 12px 边距、20px 圆角、1px 边框、14px 内边距，距底 `12px + safe-area-inset-bottom`，悬浮在内容上方而不是通栏贴底。三个按钮等宽、44px 高、14px 圆角，与卡内按钮共用同一组件；"保存到相册"主色，"重新生成"、"编辑"次级；仅有图纸且非编辑态显示。
7. 手机端 hero 整体不渲染；`window.print` 入口不渲染。
8. 编辑态：复用上一轮的全屏 `PatternEditor`，由 `MobileLayout` 直接挂载为 `position: fixed` 覆盖层，不再依赖 `.preview-panel.editing-active` 选择器。

验收：`measure-mobile.mjs` 断言顶部到上传卡 ≤ 72px、顶部到生成按钮 ≤ 300px、上传卡到结果卡 ≤ 24px；sticky 元素只有 AppBar；页面无 `.hero-section`。

### Step 3：结果卡重做（0.5 天）

1. 头部一行：左"图纸预览"，右两段开关"色号 | 纯色"（浅紫填充）。标题下一行 12px 灰字：`52×61 · 1106 颗 · 8 色`。删除四个数字块。
2. 图纸容器 `MobilePatternPaper`：
   - 高度 = 卡片内宽 × `rows / cols`，由 `ResizeObserver` 计算，不用视口高度。
   - 缩放 `paperScale = 内宽 / 实际网格宽`，上下无留白。
   - 去掉渐变背景与内层圆角，图纸直接贴 14px 内边距。
3. 右下角圆形浮动按钮"放大"，打开 `PatternZoomView` 全屏只读视图。
4. AI 候选缩略图（多于 1 张时）放在图纸上方一行横向滚动。
5. 色号清单 `LegendChips`：两列，36px 高芯片（色块 + 色号 + 数量），超过 8 个显示"查看全部 N 色"。

验收：结果卡顶部到图纸顶部 ≤ 120px；图纸上下留白 ≤ 16px；清单 8 色时高度 ≤ 160px。

### Step 4：AI 卡与参数卡瘦身（0.5 天）

AI 卡：

1. 风格改为一行横向滚动 chip（只显示名称，选中态浅紫）。
2. "补充描述"与"补充指令"合并为一个输入框，`rows=2`，占位文案"例如：换成纯白背景、去掉文字"。`aiNegativePrompt` 状态移除，内容并入 `aiPrompt`。
3. "更多选项"折叠行（带右箭头）：构图 4 段、候选数量 4 段、效果参考图（一行文字按钮 + 已选文件名 + 移除）。默认收起。
4. 生成按钮为该卡唯一主按钮。

参数卡：

1. 图纸宽度：chip 行（52 / 104 / 156 / 208）+ "自定义"数字输入（24–208，步进 4），删除滑块。
2. 最大颜色数：−/+ stepper + 数值，范围 4–色卡上限，松手即 `regenerate`。
3. "更多设置"可点行：色卡品牌、形状、高级量化（去背景、孤立豆、抖动）。
4. 画板模式下参数卡只显示宽度 + 色卡。

验收：AI 卡默认折叠态高度 ≤ 1.5 个视口；参数卡默认态 ≤ 260px；无 `<input type="range">` 出现在手机端。

### Step 5：视觉统一与回归（0.5 天）

1. 抽 `src/styles/mobile.css`，手机端全部样式集中于此，`App.css` 中 620px 断点只保留编辑器相关规则。
2. 卡片、分段控件、按钮三类基础样式统一（见第 2 节）。
3. 主按钮唯一性检查：每个视图状态下 `.primary-btn` 数量 = 1。
4. `measure-mobile.mjs` 补齐第 1 节全部断言。
5. 真机回归：iOS Safari、Android Chrome、微信，走完"上传 → 调宽度 → 编辑 → 保存到相册"。

---

## 5. 涉及文件

```text
src/hooks/usePatternWorkspace.ts        新增，状态与逻辑
src/layouts/DesktopLayout.tsx           新增，现有 JSX 迁入并恢复
src/layouts/MobileLayout.tsx            新增
src/components/mobile/AppBar.tsx        新增
src/components/mobile/SourceCard.tsx    新增
src/components/mobile/ResultCard.tsx    新增
src/components/mobile/MobilePatternPaper.tsx 新增
src/components/mobile/LegendChips.tsx   新增
src/components/mobile/SettingsCard.tsx  新增
src/components/mobile/IntroCard.tsx     新增
src/components/mobile/MobileActionBar.tsx 新增
src/styles/mobile.css                   新增
src/App.tsx                             瘦身为布局分发
src/App.css                             删除手机端补丁
scripts/measure-mobile.mjs              补断言
```

---

## 6. 风险与处理

| 风险 | 处理 |
|---|---|
| 状态抽取改动面大，容易引入回归 | Step 1 独立提交，UI 零改动，verify 全绿后再进 Step 2 |
| 两套布局后新增功能要写两遍 | 控件级组件（chip 行、stepper、分段开关、清单芯片）做成共享组件，布局层只负责摆放 |
| `aiNegativePrompt` 合并后旧 URL / 本地状态不兼容 | 该状态未持久化，直接移除 |
| 图纸容器按比例计算高度时超长图（rows ≫ cols）过高 | 上限 `min(内宽 × rows/cols, 80vh)`，超出时允许容器内滚动 |
| 删除滑块后用户习惯变化 | 数字输入保留任意 4 的倍数，chip 覆盖常用值 |

---

## 7. 顺序与提交

```text
Step 1 → Step 2 → Step 3 → Step 4 → Step 5
```

每个 Step 一个提交，推送 `preview` 后部署预览链接对照第 1 节数值。总工时 2.5 天。Step 1 + Step 2 完成即可修掉线上明显的错位问题，建议先发一版。
