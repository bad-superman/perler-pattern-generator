# 小红书手机端改版宣发素材

## 素材清单

- `source/pet-reference.png`：Task 1 为本次宣发专门生成的猫咪源图，不是第三方照片
- `source/provenance.md`：源图生成日期、完整提示词、工具和 SHA-256 来源记录
- `approved-assets.sha256`：经人工视觉审核批准的 14 个媒体文件哈希清单
- `copy/publish.md`：首选标题、备选标题、正文、标签和置顶评论
- `screenshots/`：真实手机端上传、结果、编辑和保存界面截图
- `carousel/01-cover.png` 至 `carousel/07-cta.png`：7 页图文成品
- `video/mobile-demo.mp4`：20–25 秒竖屏演示视频
- `scripts/capture-mobile.mjs`：捕获真实手机端界面
- `scripts/render-carousel.mjs`：渲染 7 页组图
- `scripts/render-video.mjs`：捕获视频帧并合成视频
- `scripts/verify-campaign.mjs`：校验素材、尺寸、时长和发布文案

## 环境前置

- Node.js 与 `npm install` 安装的项目依赖。
- Playwright Chromium：`npx playwright install chromium`。
- `ffmpeg` 与 `ffprobe` 必须可从 `PATH` 执行。非标准安装位置可分别通过
  `FFMPEG_PATH=/path/to/ffmpeg` 和 `FFPROBE_PATH=/path/to/ffprobe` 指定。

## 复现

截图脚本需要已启动的应用。先在一个终端启动本地应用：

```bash
npm run dev
```

再在另一个终端依次运行三个生成命令：

```bash
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/capture-mobile.mjs
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/render-carousel.mjs
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/render-video.mjs
```

完成后运行校验：

```bash
node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
```

校验器会独立检查批准清单的文件集合必须恰好包含源图、5 张截图、7 张组图和最终
MP4，并逐个核对 SHA-256。生成脚本导致哈希变化是预期的，但
`approved-assets.sha256` **只能在重新完成全部媒体的人工视觉审核后刷新**；不得为让校验
通过而直接更新哈希。批准时从仓库根目录运行：

```bash
sha256sum \
  marketing/xiaohongshu/2026-10-mobile-launch/source/pet-reference.png \
  marketing/xiaohongshu/2026-10-mobile-launch/screenshots/*.png \
  marketing/xiaohongshu/2026-10-mobile-launch/carousel/*.png \
  marketing/xiaohongshu/2026-10-mobile-launch/video/mobile-demo.mp4 \
  | sed 's#marketing/xiaohongshu/2026-10-mobile-launch/##' \
  > marketing/xiaohongshu/2026-10-mobile-launch/approved-assets.sha256
```

## 发布建议

小红书先发 7 页图文，视频作为第二条或同日补充。

## 发布交接

1. 图文按 `carousel/01-cover.png` 到 `carousel/07-cta.png` 的顺序发布。
2. 首选标题、正文和置顶评论从 `copy/publish.md` 复制。
3. 视频使用 `video/mobile-demo.mp4`。
4. 发布前把真实工具入口写入小红书主页简介。
5. 未来若修改产品界面，依次重新执行截图、组图和视频三个生成脚本，再运行校验脚本。
6. 本次源图由 Cursor image generation 于 2026-10-28 生成；完整提示词和源图
   SHA-256 见 `source/provenance.md`，发布归档需连同该记录和批准哈希清单保存。
