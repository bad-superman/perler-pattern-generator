/**
 * 个人小组件桥接说明：实现位于 ../miniapp-xhs-widget/src/platform/xhs-widget-bridge.ts。
 * 小组件使用原生 xhs.chooseImage、xhs.canvasGetImageData、
 * xhs.canvasToTempFilePath 和 xhs.saveImageToPhotosAlbum，不复用 Taro API。
 */
export const XHS_WIDGET_PLATFORM = 'xhs-widget' as const
