/**
 * 内置默认提供方（D37）：图片/视频/音频/文本四类形态，启动期与官方功能同批注册。
 *
 * 与 detailPreview.ts（**纯注册表**，契约模块 contribution 的依赖）分文件——
 * .vue 组件不能进契约链，否则渲染层纯逻辑测试被整张组件图拖挂（D30 纪律）。
 * 启动期注册（main.ts 调用），三方动态注册天然更晚 → 认领可覆盖内置（D37 ②）。
 */
import ImagePreview from './ImagePreview.vue'
import VideoPreview from './VideoPreview.vue'
import AudioPreview from './AudioPreview.vue'
import TextPreview from './TextPreview.vue'
import { registerDetailPreview, type DetailPreviewProvider } from '../detailPreview'
import { isTextExtension } from '../../lib/media'

/** 注册四类内置预览（main.ts 启动期调用）。 */
export function registerBuiltinDetailPreviews(): void {
  const builtin = (id: string, claims: DetailPreviewProvider['claims'], component: DetailPreviewProvider['component']): void => {
    registerDetailPreview({ id, claims, component })
  }
  builtin('builtin:text', (item) => isTextExtension(item.extension), TextPreview)
  builtin('builtin:image', (item) => item.mediaType === 'image', ImagePreview)
  builtin('builtin:video', (item) => item.mediaType === 'video', VideoPreview)
  builtin('builtin:audio', (item) => item.mediaType === 'audio', AudioPreview)
}
