/** 微信小程序适配入口。保留 Taro 实现，避免平台 API 泄漏到共享核心。 */
export {
  showSavePermissionHint,
  taroAlbumAdapter as wechatAlbumAdapter,
  taroCanvasAdapter as wechatCanvasAdapter,
  taroImagePicker as wechatImagePicker,
} from './bridge'
