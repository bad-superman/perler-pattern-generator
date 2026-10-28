# 小红书手机端改版宣发素材

## 素材清单

- `source/pet-reference.png`：Task 1 为本次宣发专门生成的猫咪源图，不是第三方照片
- `copy/publish.md`：首选标题、备选标题、正文、标签和置顶评论
- `screenshots/`：真实手机端上传、结果、编辑和保存界面截图
- `carousel/01-cover.png` 至 `carousel/07-cta.png`：7 页图文成品
- `video/mobile-demo.mp4`：20–25 秒竖屏演示视频
- `scripts/capture-mobile.mjs`：捕获真实手机端界面
- `scripts/render-carousel.mjs`：渲染 7 页组图
- `scripts/render-video.mjs`：捕获视频帧并合成视频
- `scripts/verify-campaign.mjs`：校验素材、尺寸、时长和发布文案

## 复现

先在一个终端启动本地应用：

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

## 发布建议

小红书先发 7 页图文，视频作为第二条或同日补充。

## 发布交接

1. 图文按 `carousel/01-cover.png` 到 `carousel/07-cta.png` 的顺序发布。
2. 首选标题、正文和置顶评论从 `copy/publish.md` 复制。
3. 视频使用 `video/mobile-demo.mp4`。
4. 发布前把真实工具入口写入小红书主页简介。
5. 未来若修改产品界面，依次重新执行截图、组图和视频三个生成脚本，再运行校验脚本。
