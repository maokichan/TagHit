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
 * 瀑布流媒体宽高比（确定性）。只有图片/视频参与变高——其余类型（文档/音频等）
 * 没有天然纵横比，一律标准 4:3。图片/视频 0.2 契约无 width/height 元数据，
 * 改由 contentHash 派生：同一文件每次扫描比值不变（虚拟化/翻页不跳动），
 * 不同文件比值散开——瀑布流恢复视觉层次；真元数据（EAV）落地后替换回实测值。
 * anchor 无 hash → 4:3。几何分布（对数均匀），视觉上中比值更密、两端稀疏。
 */
export function masonryRatioOf(view: { contentHash: string | null; mediaType: MediaType }): number {
  if (view.mediaType !== 'image' && view.mediaType !== 'video') return 4 / 3
  const hash = view.contentHash
  if (!hash) return 4 / 3
  const u = parseInt(hash.slice(0, 8), 16) / 0xffffffff
  const ratio = 0.5 * Math.pow(4, u)
  return Math.min(Math.max(ratio, 1 / MAX_RATIO), MAX_RATIO)
}
