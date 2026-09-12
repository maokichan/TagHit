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
 * 视频宽高（`video.videoWidth/Height`）；极端比例钳制在 [1/2.2, 2.2]（布局守护）。
 *
 * 实测值缺失（旧数据/未抓帧/解析失败）→ **中性 4:3 占位**，与文档/音频一致。
 * 历史行为（2026-09-12 改）：缺失时用 contentHash 派生一个**假比例**——视频在抓帧完成前
 * 就会按假比例出框，卡片用 object-cover 填满 → 画面被裁，用户看到"比例和原始的不一样"。
 * 假数据在这里没有任何收益：真实比例到达后卡片会重排，宁可让它从占位跳到真值。
 */
export function masonryRatioOf(view: { contentHash: string | null; mediaType: MediaType; width?: number | null; height?: number | null }): number {
  if (view.mediaType !== 'image' && view.mediaType !== 'video') return 4 / 3
  if (view.width != null && view.height != null && view.width > 0 && view.height > 0) {
    return Math.min(Math.max(view.width / view.height, 1 / MAX_RATIO), MAX_RATIO)
  }
  return 4 / 3
}
