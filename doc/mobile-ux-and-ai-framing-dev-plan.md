# 手机端体验与 AI 构图优化开发计划

更新时间：2026-10-26

承接 `doc/pattern-quality-optimization-plan.md`（量化与提示词已落地）。本计划解决两类问题：

1. AI 生成时头像参考图被补出身子。
2. 手机端信息架构、操作路径和编辑器尺寸不符合使用习惯。

---

## 1. 实测基线（iPhone 13，390×844，视口高 664px）

| 项目 | 现状 | 目标 |
|---|---|---|
| 功能区首次出现位置 | 1026px（标题 + 轮播共 988px） | ≤ 360px，模式切换与上传在首屏 |
| 上传区 → 图纸预览 | 约 1000px | 预览紧跟上传，生成后自动定位 |
| 操作区高度 | 1073–1096px | 展开态 ≤ 520px，默认折叠态 ≤ 300px |
| 预览区：统计卡 + 图纸 + 清单 | 统计卡单列约 400px，清单单列 13 行 | 统计一行，清单两列可折叠 |
| 图纸缩放（52×68） | 27%，单格约 6px | 默认纯色；放大查看单格 ≥ 14px |
| 编辑器画布 | 550×328px，缩略图 108px 常驻遮挡 | 全屏 100dvh，缩略图可收起 |
| 空页总高 / 生成后总高 | 2671px / 3850px | ≤ 1600px / ≤ 2400px |

测量脚本见第 7 节，后续每个阶段都复跑一次。

---

## 2. 设计原则

- 桌面端布局不变；手机端（≤ 620px）通过响应式断点和条件渲染调整，不分叉成两套页面。
- 判断手机端统一用一个 `useMediaQuery('(max-width: 620px)')` hook，避免 CSS 与 JS 各判各的。
- 用户的主路径是"上传 → 看到图纸 → 调一两个参数 → 导出"。所有不在主路径上的东西（介绍、推广、色卡品牌、形状、抖动）在手机端默认折叠或后置。
- verify 脚本依赖的类名（`.pattern-grid`、`.legend-item`、`.paper-overview`、`.result-summary`、`.section-title`）保持存在，桌面端 DOM 结构不变。

---

## 3. 分阶段任务

### Phase A：AI 构图约束（0.5 天）

目标：头像参考图不再生成身体；用户可主动选择构图。

任务：

1. `src/agnes/styles.ts`
   - Q 版预设去掉 `a small body`，改为 `oversized head and compact proportions`。
   - 新增 `framing` 参数：`'follow' | 'headshot' | 'half' | 'full'`。
     - `follow`（默认）：`Keep the same framing as the reference. If it shows only the head and shoulders, output only the head and shoulders; do not add body parts that are not visible in the reference.`
     - `headshot`：`Show only the head and shoulders.`
     - `half`：`Show the upper body from the waist up.`
     - `full`：`Show the full body from head to feet.`
   - `buildAgnesPrompt` 签名改为接收一个 options 对象，避免继续增加位置参数。
2. `src/agnes/client.ts` `pickAgnesSize`：接收 `framing`；`headshot` 固定 `1:1`，`half` / `full` 允许 `3:4`，`follow` 维持按原图比例。
3. `src/App.tsx` AI 面板：
   - 新增"构图"分段控件（跟随原图 / 头像 / 半身 / 全身）。
   - 把"候选数量"移到"AI 生成拼豆图"按钮之前。
   - "负面提示词"标签改为"补充指令"。
4. `doc/current-ai-prompts.md` 同步。

验收：

- `?debug=1` 下用头像参考图 + Q 版，prompt 包含 framing 约束，请求 ratio 为 `1:1`。
- 用 `doc/samples/portrait.png` 实跑一次 Agnes（服务可用时），成图无身体。

### Phase B：手机端信息架构重排（1 天）

目标：首屏见功能，上传后立刻看到结果。

任务：

1. 新增 `src/hooks/useMediaQuery.ts`。
2. hero 收缩（`src/App.tsx` + `App.css`）：
   - 手机端 `hero-copy` 只保留一行标题和一个主按钮（上传图片 / 创建画板），副标题隐藏，"打印图纸"隐藏。
   - `hero-side-panel`（介绍轮播 + 推广）从 hero 移出，手机端渲染在预览区之后、页脚之前；推广保留一条单行 `ad-bar` 放在页脚上方。
3. 主路径顺序：
   - 手机端 `workspace` 改为单列，DOM 顺序为：模式 tab（吸顶）→ 上传区 / AI 面板 → 预览区 → 参数区。
   - 实现方式：把侧栏拆成两个组件 `SourcePanel`（模式 + 上传 + AI 面板）和 `SettingsPanel`（宽度、颜色、色卡、形状、高级、显示模式），桌面端两者仍在同一个 `aside` 内，手机端 `SettingsPanel` 渲染在预览区之后。
4. 生成完成后 `previewPanelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })`，仅手机端触发。
5. 底部固定操作栏（手机端、有图纸且非编辑态时显示）：重新生成 / 编辑 / 导出。使用 `padding-bottom: env(safe-area-inset-bottom)`，页面底部预留等高的占位。
6. 模式 tab 手机端 `position: sticky; top: 0`。

验收：

- 功能区顶部 ≤ 360px；上传区底部到预览区顶部 ≤ 80px。
- 空页总高 ≤ 1600px。
- 桌面端 verify 脚本全部通过，布局截图与改前一致。

### Phase C：参数区与预览区精简（0.5 天）

目标：减少高度，提升图纸可读性。

任务：

1. 参数区分组：
   - "基础"：图纸宽度（滑块 + 快捷尺寸）、最大颜色数。
   - "更多设置"（`<details>`，默认折叠）：色卡、形状、高级量化。
   - 撤销 / 重做从侧栏移除（编辑器工具栏已有）；"重新生成 / 编辑 / 导出"在手机端由底部操作栏承担，侧栏内隐藏。
   - "色号图纸 / 纯色预览"切换移到预览区标题栏右侧。
2. 滑块节流：`onChange` 只更新显示值，`onPointerUp` / `onKeyUp` / `onTouchEnd` 时才 `regenerate`。快捷尺寸按钮仍立即触发。
3. 预览区：
   - `result-summary` 手机端改为一行四项的紧凑数字条。
   - `legend` 手机端两列；超过 8 色时默认只显示前 8 个，提供"查看全部 N 色"。
   - 手机端默认 `renderMode = 'solid'`；首次挂载时根据媒体查询设置一次，不覆盖用户之后的选择。
   - 新增"放大查看"按钮，打开全屏只读视图，复用 `EditablePatternGrid` 的可缩放 stage（`tool` 传 `'none'`，不响应绘制），支持双指缩放与拖动，关闭后回到原位置。
4. 触控尺寸：`.quick-size-grid button`、`.segmented button` 在手机端 `min-height: 44px`；滑块 thumb 放大到 24px。

验收：

- 生成后总高 ≤ 2400px。
- 预览区内图纸顶部距预览区顶部 ≤ 160px。
- 放大视图中单格 ≥ 14px，色号可读。

### Phase D：编辑器全屏化（1 天）

目标：手机端画板不再被挤在半屏里。

任务：

1. `PatternEditor` 新增 `fullscreen` prop；手机端进入编辑时：
   - 外层 `position: fixed; inset: 0; height: 100dvh; z-index` 高于其余内容；`body` 加 `overflow: hidden`。
   - 顶部一条 44px 的栏：返回（完成）、当前尺寸、撤销 / 重做。
   - 工具栏和取色条固定在底部拇指区，`safe-area-inset-bottom`。
   - 画布占满中间剩余高度。
2. 缩略图改为可收起：默认收起为 36px 圆形按钮，点击展开；展开态 5 秒无操作自动收起。
3. 初始缩放：进入编辑时按"单格 ≥ 14px 且整幅尽量可见"二者取大计算初始 scale；提供"适应屏幕 / 1:1"两个快捷缩放。
4. 画板模式：
   - 创建画板的原生 `confirm` 改为行内确认（"将清空当前图纸，确认创建？" + 两个按钮）。
   - 创建后直接进入全屏编辑，不再依赖页面滚动位置。
5. 退出编辑后 `scrollIntoView` 到预览区顶部。

验收：

- 手机端进入编辑后，画布可视区域 ≥ 视口高 70%。
- 缩略图收起态不遮挡画布。
- 桌面端编辑器布局与现状一致。

### Phase E：导出与收尾（0.5 天）

任务：

1. 导出到手机相册：
   浏览器没有直接写入相册的 API，按环境分三层，手机端的主按钮统一叫"保存到相册"：
   - 第一层 `navigator.canShare({ files })` 为真（iOS Safari 15+、Android Chrome 89+）：把 PNG 包成 `File`，调用 `navigator.share({ files })`。iOS 分享面板里"存储图像"直接进相册，Android 分享到"相册 / 图库 / 文件"应用。
   - 第二层 不支持文件分享（微信、QQ、部分国产浏览器内核）：弹出全屏图片预览层（`canvas.toBlob` → object URL，`<img>` 不加 `pointer-events: none`，不禁用长按），文案"长按图片 → 保存到相册"。微信和各家内置浏览器的长按菜单都会写入相册。
   - 第三层 兜底：`saveAs` 下载。Android 会进"下载"目录（多数相册应用会索引到），iOS 进"文件"。弹层里以次级按钮"下载文件"提供。
   - 用户取消分享（`AbortError`）不报错、不降级，静默返回。
   - 导出 PNG 尺寸在手机端限制长边 ≤ 4096px，避免 iOS 上 canvas 超限返回空 blob。
   - 桌面端行为不变，仍直接下载。
2. 手机端隐藏"打印图纸"。
3. AI 生成遮罩加阶段文案：发送参考图 → AI 生成中 → 量化成图纸。
4. 候选缩略图移到预览区顶部（有多张候选时）。
5. 文案与可达性：所有图标按钮补 `aria-label`；`segmented` 控件加 `role="group"`。

---

## 4. 涉及文件

```text
src/hooks/useMediaQuery.ts            新增
src/components/SourcePanel.tsx        新增（从 App.tsx 拆出）
src/components/SettingsPanel.tsx      新增（从 App.tsx 拆出）
src/components/MobileActionBar.tsx    新增
src/components/PatternZoomView.tsx    新增（全屏只读查看）
src/components/ExportPreviewSheet.tsx 新增
src/components/PatternEditor.tsx      fullscreen 模式
src/components/EditablePatternGrid.tsx 只读模式、初始缩放、缩略图收起
src/agnes/styles.ts                   framing、options 签名
src/agnes/client.ts                   pickAgnesSize 接收 framing
src/App.tsx                           状态与布局编排
src/App.css                           手机端断点样式
doc/current-ai-prompts.md             同步
scripts/measure-mobile.mjs            新增（第 7 节）
```

---

## 5. 风险与处理

| 风险 | 处理 |
|---|---|
| 拆分 `App.tsx` 时 props 过多 | 先用一个 `controls` 对象打包传递，不引入状态库 |
| 手机端 DOM 顺序变化导致 verify 脚本选择器失效 | verify 脚本都在 1440px 视口运行，桌面端 DOM 不变；新增手机端测量脚本单独验证 |
| `100dvh` 在旧版 iOS Safari 不支持 | 回退 `100vh` 并用 `-webkit-fill-available` |
| 全屏编辑器与浏览器手势冲突（下拉刷新、侧滑返回） | 画布容器 `touch-action: none`，`overscroll-behavior: contain` |
| 微信内置浏览器下载被拦 | Phase E 第二层：长按保存弹层 |
| iOS 上 `navigator.share` 必须在用户手势内同步触发，`toBlob` 是异步的 | 点击时先 `await` 生成 blob 再调用 share 在 Safari 可用（手势有效期约 1s）；超时则回落到预览弹层 |
| iOS canvas 面积上限（约 16M 像素）导致 `toBlob` 为 null | 手机端导出长边限制 4096px |

---

## 6. 顺序与依赖

```text
A（独立）
B → C → D
B → E
```

A 可与 B 并行。最小可交付集：A + B + C。

预计总工时 3.5 天。

---

## 7. 验证方式

1. `npm run lint` && `npm run build`。
2. 桌面端：现有 `verify-*.mjs` 全部通过。
3. 手机端：新增 `scripts/measure-mobile.mjs`（Playwright `devices['iPhone 13']`），输出并断言：
   - 功能区顶部位置、上传区到预览区距离、空页 / 生成后总高、预览区内图纸顶部位置；
   - 编辑态画布高度占视口比例；
   - 底部操作栏与模式 tab 的 `position`。
   每个 Phase 结束跑一次，把数字写回第 1 节表格。
4. 真机：iOS Safari、Android Chrome、微信内置浏览器各过一遍主路径（上传 → 调参 → 编辑 → 导出）。导出一项要确认图片实际出现在系统相册里：iOS Safari 走分享面板"存储图像"，Android Chrome 走分享到相册应用，微信走长按保存。
5. AI：Phase A 完成后，用头像、半身、全身三类参考图各跑一次，留存 AI 原图与图纸截图。
