# 双端纯本地小程序迁移基线

这里是微信 / 小红书小程序迁移的第一阶段代码边界。

## 当前已完成

- `src/quantize/index.ts` 暴露 `quantizeRgbaGrid`，不依赖 `window`、`document` 或 `HTMLImageElement`。
- `src/miniapp/core/pattern.ts` 将量化结果转换成共享的 `PatternSnapshot` 形状。
- `src/miniapp/core/index.ts` 提供小程序侧统一入口。
- `miniapp/` 提供 Taro 4 微信 / 小红书双端工程，页面状态流已接通。
- `miniapp/src/platform/bridge.ts` 已接入本地图片选择、Canvas RGBA 解码、PNG 导出和相册保存。
- 结果页支持双指缩放、单指拖动和镜像预览；编辑页支持画笔 / 橡皮、选色弹窗、撤销 / 重做。
- 参数页支持方形 / 原比例网格，导出按当前镜像状态绘制，并带行列索引和 10 格辅助线。

## 下一步

1. 在微信开发者工具和小红书 IDE 中补真机回归样本。
2. 针对平台差异补充权限拒绝、超大图片和低端机内存测试。
3. 接入更完整的编辑工具（批量填充、符号显示和导出分页）。

## 本地构建

```bash
cd miniapp
npm install --include=optional
npm run typecheck
npm run build:weapp
npm run build:xhs
```

项目已在 `package.json` 中允许 Taro、SWC、esbuild 等必要依赖执行安装脚本；如果使用 npm 11 后仍提示 SWC bindings 缺失，执行 `npm install-scripts approve @swc/core` 后再构建。

微信和小红书构建产物不会再共用一个目录：

- 微信开发者工具导入 `miniapp/`（项目配置中的 `miniprogramRoot` 指向 `dist/`）。
- 小红书 IDE 导入 `miniapp/dist-xhs/`，或使用 `miniapp/project.xhs.json` 指定的 `dist-xhs/`。

不要在微信 IDE 正在监听时把小红书产物写入 `dist/`，否则 IDE 会短暂读到缺少 `app.json` 的半成品。微信项目关闭了开发者工具的 ES6 转 ES5（`es6`）、`enhance` 和 `useApiHook`：开启 ES6 转 ES5 会让 iOS 真机调试在启动时栈溢出，并连带报 `d.mw.trigger` 错误。重新导入项目后请执行一次“清除缓存并重新编译”。

平台接口草案位于 `src/miniapp/platform/types.ts`。微信和小红书适配器只实现这些接口，核心层不感知具体平台。

## 设计约束

- 核心算法只接收 RGBA 字节和普通 TypeScript 参数。
- 平台 API 只能出现在 `miniapp/src/platform/`，页面不直接调用平台 API。
- 首发版本不引入 AI、图库、登录、支付和外部推广。
