/**
 * 媒体预览助手（字节闸门渲染侧）。
 *
 * - 媒体字节：sourceUri → taghit-file:// 协议 URL，<img>/<video>/<audio> 直取
 *   （宿主 protocol.ts 白名单 = 各工作区来源根 + userData，Range/MIME 由协议处理）；
 * - 文本字节：走窄桥 api.items.readText（宿主侧白名单 + 2MiB 上限，本表只做
 *   调用前的类别判定，避免明知不可读还发一次 IPC）。
 */
import type { MediaType } from './viewModel'

export const TAGHIT_FILE_SCHEME = 'taghit-file'

/** 宿主绝对路径（正斜杠归一）→ taghit-file:/// 协议 URL */
export function taghitFileUrl(absPath: string): string {
  const segments = absPath
    .split(/[\\/]/)
    .filter(Boolean)
    .map(encodeURIComponent)
  return `${TAGHIT_FILE_SCHEME}:///${segments.join('/')}`
}

/** 文本可读扩展名（与宿主 content.ts 的白名单保持一致） */
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'ts', 'jsx', 'tsx',
  'css', 'html', 'htm', 'xml', 'yml', 'yaml', 'ini', 'log', 'csv', 'mjs', 'cjs',
])

export type PreviewKind = 'image' | 'video' | 'audio' | 'text' | 'none'

/** 文本可读扩展名判定（与宿主 content.ts 白名单同名单）——文本预览提供方的认领依据。 */
export function isTextExtension(ext: string | null): boolean {
  return ext != null && TEXT_EXTS.has(ext)
}

/** 详情页内嵌预览类别：text 判定以宿主白名单为准，其余按媒体类别（不可解码时组件 @error 兜底） */
export function previewKindOf(mediaType: MediaType, ext: string | null): PreviewKind {
  if (ext != null && TEXT_EXTS.has(ext)) return 'text'
  if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') return mediaType
  return 'none'
}

/** 瀑布流宽高比上限（对齐旧版钳制区间） */
const MAX_RATIO = 2.2

/**
 * 瀑布流媒体宽高比。**比例只取实测值**：图片用扫描时解析的固有尺寸，视频用抓帧时回写的
 * 视频宽高（`video.videoWidth/Height`），音频用封面提取回写的封面宽高（宿主原生能力，
 * 与视频抓帧同族）；极端比例钳制在 [1/2.2, 2.2]（布局守护）。
 *
 * 实测值缺失（旧数据/未抓帧/无封面/解析失败）→ **中性 4:3 占位**，与文档一致。
 * **不要**用 contentHash 派生"假比例"兜底（已裁定为缺陷源，勿回退，见 D26）：抓帧完成前按假比例
 * 出框、object-cover 一填就裁画面，而真实比例到达后反正要重排——假数据没有任何收益，
 * 宁可让它从占位跳到真值。
 */
export function masonryRatioOf(view: { contentHash: string | null; mediaType: MediaType; width?: number | null; height?: number | null }): number {
  if (view.mediaType !== 'image' && view.mediaType !== 'video' && view.mediaType !== 'audio') return 4 / 3
  if (view.width != null && view.height != null && view.width > 0 && view.height > 0) {
    return Math.min(Math.max(view.width / view.height, 1 / MAX_RATIO), MAX_RATIO)
  }
  return 4 / 3
}
