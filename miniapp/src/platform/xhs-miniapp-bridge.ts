/**
 * 小红书普通小程序适配入口。
 * 普通小程序仍通过 Taro 的 xhs 编译目标运行；与个人小组件的原生 xhs API 实现分开。
 */
export {
  showSavePermissionHint,
  taroAlbumAdapter as xhsMiniappAlbumAdapter,
  taroCanvasAdapter as xhsMiniappCanvasAdapter,
  taroImagePicker as xhsMiniappImagePicker,
} from './bridge'
