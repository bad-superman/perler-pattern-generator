# 小红书个人小组件版

这是独立于 `miniapp/` 的个人小组件工程，不会覆盖微信小程序或普通小红书小程序入口。

## 设计边界

- 只有 `pages/index/index` 一个页面。
- 单页面连续体验：选图 / 空白画板 → 参数面板 → 生成结果 → 编辑、镜像、保存。
- 使用原生 `xhs` API，不假设微信 `wx` 或 Taro API 在小组件运行时可用。
- 图片只在本机 Canvas 中读取和量化，不上传图片。
- Canvas 放在页面底部的 1px 可见容器中，不使用 `-10000px` 的屏外隐藏节点。
- 结果图纸放在 `scroll-view` 中，兼容半屏容器的纵向滚动和网格横向滚动。

## 构建

在仓库根目录执行：

```bash
npm run build:xhs-widget
```

构建产物：

```text
miniapp-xhs-widget/dist
```

构建同时执行 2 MiB 体积检查。目前产物约 30 KiB（未计入 IDE 运行时）。

## 导入 IDE

先在小红书开发者工具中选择“小组件项目”，再导入 `miniapp-xhs-widget/dist`。使用你个人小组件对应的 AppID 替换 `dist/project.config.json` 中的 `appid`。

## 真机优先验证

1. `xhs.chooseImage` 返回的临时路径能否被 `drawImage` 使用。
2. `xhs.canvasGetImageData` 是否返回完整 RGBA 字节数组。
3. 40×40、80×80 图纸是否都能完成量化。
4. 预览和半屏滚动是否互不抢手势。
5. `xhs.canvasToTempFilePath` 能否导出 PNG。
6. `xhs.saveImageToPhotosAlbum` 在 iOS / Android 上是否成功保存。
7. 拒绝相册权限后页面是否仍能继续编辑。

当前工程已提供最小链路，但小组件 API 的具体能力仍必须在小红书 IDE 和真机上确认；如果 Canvas 像素读取不支持，不能继续假设纯本地方案可用。
