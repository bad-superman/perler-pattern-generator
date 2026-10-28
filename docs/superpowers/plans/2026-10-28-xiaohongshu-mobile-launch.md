# 小红书手机端改版宣发素材 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 产出一套可直接发布的小红书素材，包括 7 张 3:4 组图、一条 20–25 秒竖屏视频、发布文案和可复用的自动截图/渲染脚本。

**Architecture:** 使用一张自有生成的宠物照片驱动当前应用的本地转换流程；Playwright 在 390px 手机视口捕获真实上传、结果、编辑和导出界面。组图由 HTML 模板渲染为 PNG，视频由真实界面帧序列经 ffmpeg 合成为 MP4，避免制作产品中不存在的界面。

**Tech Stack:** React/Vite 应用、Node.js、Playwright、HTML/CSS、ffmpeg/ffprobe、Cursor 图片生成工具。

## Global Constraints

- 首发受众是想把照片做成拼豆、但不会画图纸的新手。
- 唯一转化路径是“主页简介入口”，不在素材中放二维码。
- 可以明确写“免费、无需登录、手机浏览器直接使用”。
- 组图使用 3:4 比例，输出尺寸固定为 1242×1660 PNG。
- 视频使用 9:16 比例，输出尺寸固定为 1080×1920，时长 20–25 秒。
- 第 3–6 页必须使用当前产品的真实手机端界面和同一张宠物照片。
- 前 2 秒必须出现宠物原图与拼豆图纸的前后对比。
- 不使用“全网最好”“百分百还原”或固定生成耗时等无法证明的承诺。
- 宠物照片必须为本次生成或明确授权的素材。

---

## File Map

```text
marketing/xiaohongshu/2026-10-mobile-launch/
  README.md                         素材清单、发布顺序和复现命令
  source/pet-reference.png          自有生成的猫咪参考照片
  copy/publish.md                   标题、正文、标签、置顶评论
  screenshots/source-card.png       上传来源卡真实截图
  screenshots/result-symbols.png    色号图真实截图
  screenshots/result-solid.png      纯色图真实截图
  screenshots/editor.png            手机编辑器真实截图
  screenshots/export-sheet.png      保存预览真实截图
  carousel/slides.html              7 页组图源模板
  carousel/01-cover.png
  carousel/02-pain-point.png
  carousel/03-upload.png
  carousel/04-result.png
  carousel/05-edit.png
  carousel/06-save.png
  carousel/07-cta.png
  video/frames/                     视频实际界面帧，生成后不提交
  video/mobile-demo.mp4             最终竖屏视频
  scripts/capture-mobile.mjs        手机界面截图
  scripts/render-carousel.mjs       组图导出
  scripts/render-video.mjs          视频帧捕获与 ffmpeg 合成
  scripts/verify-campaign.mjs       尺寸、数量、时长和文案校验
```

`video/frames/` 加入仓库根目录 `.gitignore`；其余最终素材和脚本提交。

---

### Task 1: 建立活动目录、宠物源图与发布文案

**Files:**
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/README.md`
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/source/pet-reference.png`
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/copy/publish.md`
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `source/pet-reference.png`，供所有截图、组图和视频统一使用。
- Produces: `assertFile(path)` 与 `readPngSize(path)`，供后续素材校验复用。

- [ ] **Step 1: 写入首轮文件校验**

在 `verify-campaign.mjs` 中使用 Node 内置模块，不新增 npm 依赖：

```js
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function assertFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  const info = await stat(absolutePath)
  if (!info.isFile() || info.size === 0) throw new Error(`Missing asset: ${relativePath}`)
  return absolutePath
}

export async function readPngSize(relativePath) {
  const buffer = await readFile(await assertFile(relativePath))
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error(`Not PNG: ${relativePath}`)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

await assertFile('source/pet-reference.png')
const publish = await readFile(await assertFile('copy/publish.md'), 'utf8')
for (const phrase of ['免费', '无需登录', '主页', '#拼豆图纸']) {
  if (!publish.includes(phrase)) throw new Error(`Copy missing phrase: ${phrase}`)
}
console.log(JSON.stringify({ stage: 'foundation', ok: true }))
```

- [ ] **Step 2: 运行校验并确认失败**

Run:

```bash
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
```

Expected: 以 `Missing asset: source/pet-reference.png` 退出。

- [ ] **Step 3: 生成自有猫咪参考图**

调用图片生成工具，输出到 `source/pet-reference.png`。使用以下完整提示词：

```text
一张自然光下的橘白猫正面半身生活照，猫咪看向镜头，头部和肩部完整，纯暖灰色背景，主体居中，毛发清晰但不过度锐化，真实摄影风格，柔和明亮，构图简洁，不出现文字、水印、人手、项圈或其他物体，正方形构图
```

图片生成后确认主体边缘清楚、背景简单、无文字和水印。

- [ ] **Step 4: 写入可直接发布的文案**

将已确认设计文档第 6 节完整复制到 `copy/publish.md`，按“首选标题 / 备选标题 / 正文 / 标签 / 置顶评论”分段。正文不得改变“主页简介入口”的转化路径。

- [ ] **Step 5: 写入素材清单和复现说明**

`README.md` 记录最终文件清单、需要先运行 `npm run dev`、三个生成命令，以及“小红书先发 7 页图文，视频作为第二条或同日补充”的发布建议。

- [ ] **Step 6: 忽略视频临时帧并重新校验**

在 `.gitignore` 添加：

```gitignore
marketing/xiaohongshu/*/video/frames/
```

Run:

```bash
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
```

Expected: 输出 `{"stage":"foundation","ok":true}`。

- [ ] **Step 7: 提交基础素材**

```bash
git add .gitignore marketing/xiaohongshu/2026-10-mobile-launch
git commit -m "准备小红书宣发源图与文案"
```

---

### Task 2: 捕获真实手机端界面

**Files:**
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/scripts/capture-mobile.mjs`
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/screenshots/*.png`
- Modify: `marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs`

**Interfaces:**
- Consumes: `source/pet-reference.png`。
- Produces: 五张真实界面截图，组图和视频只允许引用这些截图或同一脚本捕获的帧。

- [ ] **Step 1: 扩展校验，要求五张截图存在**

在校验脚本中加入：

```js
const screenshots = [
  'screenshots/source-card.png',
  'screenshots/result-symbols.png',
  'screenshots/result-solid.png',
  'screenshots/editor.png',
  'screenshots/export-sheet.png',
]
for (const screenshot of screenshots) {
  const { width, height } = await readPngSize(screenshot)
  if (width < 300 || height < 200) throw new Error(`Screenshot too small: ${screenshot}`)
}
```

- [ ] **Step 2: 运行校验并确认因截图缺失而失败**

Run:

```bash
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
```

Expected: 第一个缺失截图报错。

- [ ] **Step 3: 实现手机截图脚本**

`capture-mobile.mjs` 使用 `devices['iPhone 13']`，监听 `console` error 和 `pageerror`。固定流程：

1. 打开 `APP_URL`，默认 `http://127.0.0.1:5173`。
2. 给第一个 `input[type=file]` 设置 `pet-reference.png`。
3. 等待 `.m-result .pattern-grid span` 和 `.m-legend .m-chip`。
4. 截取包含同一只猫预览的 `.m-source` 为 `source-card.png`。
5. 截取 `.m-result` 为 `result-symbols.png`。
6. 点击“纯色”，截取 `.m-result` 为 `result-solid.png`。
7. 点击底部“编辑”，等待 `.m-editor [data-testid="editor-toolbar"]`，截取视口为 `editor.png`。
8. 点击工具栏完成按钮退出，点击“保存到相册”，等待 `.m-sheet img`，截取视口为 `export-sheet.png`。
9. 若出现浏览器错误或任一截图为空，脚本退出 1。

元素截图统一使用 `{ animations: 'disabled' }`；视口截图统一使用 `{ fullPage: false }`，避免伪造产品界面。

- [ ] **Step 4: 启动应用并生成截图**

Run:

```bash
npm run dev
```

另一个终端运行：

```bash
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/capture-mobile.mjs
```

Expected: 输出五个截图路径，`errors` 为 `[]`。

- [ ] **Step 5: 校验并人工检查截图**

Run:

```bash
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
```

Expected: 截图检查通过。人工确认五张图均为同一只猫、图纸色号可读、编辑器工具栏完整、截图内没有推广轮播。

- [ ] **Step 6: 提交真实截图**

```bash
git add marketing/xiaohongshu/2026-10-mobile-launch
git commit -m "捕获小红书宣发手机端截图"
```

---

### Task 3: 渲染七页图文组图

**Files:**
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/carousel/slides.html`
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/scripts/render-carousel.mjs`
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/carousel/01-cover.png` through `07-cta.png`
- Modify: `marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs`

**Interfaces:**
- Consumes: Task 2 的五张截图和 `source/pet-reference.png`。
- Produces: 七个 `[data-slide]` 页面和七张 1242×1660 PNG。

- [ ] **Step 1: 扩展校验，要求七张固定尺寸组图**

```js
const carousel = [
  '01-cover.png', '02-pain-point.png', '03-upload.png', '04-result.png',
  '05-edit.png', '06-save.png', '07-cta.png',
]
for (const name of carousel) {
  const size = await readPngSize(`carousel/${name}`)
  if (size.width !== 1242 || size.height !== 1660) {
    throw new Error(`Wrong carousel size: ${name} ${size.width}x${size.height}`)
  }
}
```

- [ ] **Step 2: 运行校验并确认组图缺失**

Expected: 以 `Missing asset: carousel/01-cover.png` 退出。

- [ ] **Step 3: 实现七页 HTML 模板**

`slides.html` 必须：

- 每页使用 `<article class="slide" data-slide="01-cover">` 结构。
- `.slide` 固定 `width:1242px;height:1660px;overflow:hidden`。
- 使用暖白、浅紫、薄荷绿和主色 `#6844EC`。
- 第 1 页使用真实宠物源图和 `result-solid.png` 形成前后对比。
- 第 3–6 页分别嵌入 Task 2 对应截图。
- 第 7 页只写“免费 · 无需登录”“工具入口在主页”“先收藏，做的时候直接找”。
- 所有图片使用相对路径，不引用网络资源。

- [ ] **Step 4: 实现 Playwright 导出脚本**

`render-carousel.mjs` 打开 `slides.html` 的 `file://` URL，逐个定位 `[data-slide]`。导出前对每页执行：

```js
const overflow = await slide.evaluate((element) => ({
  x: element.scrollWidth > element.clientWidth,
  y: element.scrollHeight > element.clientHeight,
}))
if (overflow.x || overflow.y) throw new Error(`Slide overflow: ${name}`)
await slide.screenshot({
  path: path.join(carouselDir, `${name}.png`),
  animations: 'disabled',
})
```

浏览器上下文 viewport 设为 `{ width: 1242, height: 1660 }`，deviceScaleFactor 设为 1。

- [ ] **Step 5: 渲染并校验**

Run:

```bash
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/render-carousel.mjs
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
```

Expected: 七张图片均为 1242×1660，无溢出错误。

- [ ] **Step 6: 逐页视觉验收**

检查缩略图状态下：

- 第 1 页无需正文即可理解“照片变拼豆色号图”。
- 第 2 页痛点不超过三行。
- 第 3–6 页手机截图中文字仍可读。
- 第 7 页行动按钮和主页入口最突出。
- 七页猫咪、主色和字体风格一致。

- [ ] **Step 7: 提交组图**

```bash
git add marketing/xiaohongshu/2026-10-mobile-launch
git commit -m "生成小红书七页宣发组图"
```

---

### Task 4: 生成 20–25 秒真实界面演示视频

**Files:**
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/scripts/render-video.mjs`
- Create: `marketing/xiaohongshu/2026-10-mobile-launch/video/mobile-demo.mp4`
- Modify: `marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs`

**Interfaces:**
- Consumes: 当前运行中的应用、统一宠物源图、Task 2 截图。
- Produces: H.264、1080×1920、20–25 秒的 MP4。

- [ ] **Step 1: 扩展视频校验**

校验脚本通过 `execFile` 调用：

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const { stdout } = await execFileAsync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'stream=width,height,codec_name:format=duration',
  '-of', 'json',
  await assertFile('video/mobile-demo.mp4'),
])
const probe = JSON.parse(stdout)
const video = probe.streams.find((stream) => stream.codec_name === 'h264')
const duration = Number(probe.format.duration)
if (!video || video.width !== 1080 || video.height !== 1920) throw new Error('Wrong video format')
if (duration < 20 || duration > 25) throw new Error(`Wrong video duration: ${duration}`)
```

并从 `node:util` 引入 `promisify`，从 `node:child_process` 引入 `execFile`。

- [ ] **Step 2: 运行校验并确认视频缺失**

Expected: 以 `Missing asset: video/mobile-demo.mp4` 退出。

- [ ] **Step 3: 实现真实界面帧捕获**

`render-video.mjs` 使用 390×693 的手机视口，每秒 10 帧。实现：

```js
async function captureFrames(page, directory, seconds) {
  const frameCount = Math.round(seconds * 10)
  for (let index = 0; index < frameCount; index += 1) {
    await page.screenshot({
      path: path.join(directory, `${String(index).padStart(4, '0')}.png`),
      animations: 'disabled',
    })
    await page.waitForTimeout(100)
  }
}
```

每个场景开始前在页面注入固定字幕层 `#campaign-caption`，字幕层使用白底黑字或半透明深色底，不能覆盖主要按钮。按以下时长捕获：

- 2 秒：原图与 `result-solid.png` 的前后对比卡。
- 3 秒：真实上传卡，执行文件选择。
- 4 秒：生成与结果出现，等待过程加速，不显示固定耗时。
- 5 秒：真实色号/纯色切换与颜色清单。
- 5 秒：真实编辑器，执行一次改色和撤销。
- 4 秒：真实保存预览与“工具入口在主页”行动字幕。

总时长固定 23 秒。

- [ ] **Step 4: 使用 ffmpeg 合成视频**

先把每个场景帧转成 10fps 片段，再按场景顺序写入 concat 清单。最终命令：

```bash
ffmpeg -y -f concat -safe 0 -i scenes.txt \
  -vf "fps=30,scale=1080:1920:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset medium -crf 18 -movflags +faststart \
  video/mobile-demo.mp4
```

脚本检查 ffmpeg 退出码；失败时保留帧目录供排查，成功后输出最终路径和时长。

- [ ] **Step 5: 运行视频生成与自动校验**

Run:

```bash
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/render-video.mjs
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
```

Expected: ffprobe 报告 H.264、1080×1920、约 23 秒。

- [ ] **Step 6: 人工观看验收**

完整播放一次并确认：

- 0–2 秒出现原图和图纸。
- 所有字幕至少停留 1.5 秒且没有被裁切。
- 真实点击顺序为上传、出图、切换、编辑、保存。
- 没有控制台报错、页面推广轮播、鼠标悬浮提示或隐私信息。
- 最后行动页停留至少 2.5 秒。

- [ ] **Step 7: 提交视频**

```bash
git add marketing/xiaohongshu/2026-10-mobile-launch
git commit -m "生成小红书手机端演示视频"
```

---

### Task 5: 全量验收与发布交接

**Files:**
- Modify: `marketing/xiaohongshu/2026-10-mobile-launch/README.md`
- Modify: `marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs`

**Interfaces:**
- Consumes: 前四个任务的全部素材。
- Produces: 可复现、可直接发布的最终活动目录。

- [ ] **Step 1: 补齐最终清单校验**

校验脚本最终必须检查：

- 1 张源图、5 张截图、7 张组图、1 条视频、1 份发布文案。
- 七张组图的文件名连续且尺寸全部为 1242×1660。
- 视频为 H.264、1080×1920、20–25 秒。
- 文案包含首选标题、正文、8 个标签和置顶评论。
- 文案包含“主页”且不包含二维码引导。

- [ ] **Step 2: 运行项目与素材检查**

Run:

```bash
npm run lint
npm run build
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
```

Expected: 三个命令全部退出 0。

- [ ] **Step 3: 核对 Git 范围**

Run:

```bash
git status --short
git diff --check HEAD
```

Expected: 只有活动目录和计划内 `.gitignore` 修改；不存在视频临时帧。

- [ ] **Step 4: 更新交接说明**

在 `README.md` 写清：

1. 图文发布顺序为 `01-cover.png` 到 `07-cta.png`。
2. 首选标题、正文和置顶评论从 `copy/publish.md` 复制。
3. 视频文件为 `video/mobile-demo.mp4`。
4. 发布前把真实工具入口写入小红书主页简介。
5. 若未来修改产品界面，重新执行截图、组图和视频三个脚本。

- [ ] **Step 5: 最终提交**

```bash
git add marketing/xiaohongshu/2026-10-mobile-launch
git commit -m "完成小红书手机端改版宣发素材"
```
