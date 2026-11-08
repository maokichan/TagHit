/**
 * 媒体类别（展示推导）与「类别 → 扩展名」映射。
 *
 * 类别不是数据库事实——条目只存文件名，类别由扩展名**推导**（viewModel.mediaTypeOf）。
 * 映射本身是**用户可配置**的（mediaTypeFilter 功能组件的设置项，config 仓持久化）：
 * "视频里包含什么格式"由用户说了算，本模块持默认值与运行时映射。
 * 筛选时类别在渲染层折叠成扩展名集合，经 ItemsQuery.extensions 下推存储——
 * 宿主与数据库不知道类别语义，只见过扩展名（DECISIONS D36）。
 */

import { i18n } from '../i18n'

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'other'

/** 可筛选类别（「其他」没有可配置的扩展名集合，不进筛选面）。 */
export const FILTERABLE_MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const
export type FilterableMediaType = (typeof FILTERABLE_MEDIA_TYPES)[number]

export const MEDIA_TYPE_LABEL: Record<FilterableMediaType, string> = {
  get image(): string {
    return i18n.global.t('mediaTypes.image')
  },
  get video(): string {
    return i18n.global.t('mediaTypes.video')
  },
  get audio(): string {
    return i18n.global.t('mediaTypes.audio')
  },
  get document(): string {
    return i18n.global.t('mediaTypes.document')
  }
}

/** 默认映射（0.2 以来 viewModel 内置表的原样迁入；设置项留空即回落到它）。 */
const DEFAULT_EXTS: Record<FilterableMediaType, readonly string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'heic'],
  video: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'm4v'],
  audio: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'markdown', 'csv', 'rtf']
}

/** config 仓的归属与键（mediaTypeFilter 功能组件的设置项）。 */
export const MEDIA_TYPE_FEATURE_ID = 'mediaTypeFilter'
export const MEDIA_EXT_CONFIG_KEY: Record<FilterableMediaType, string> = {
  image: 'imageExts',
  video: 'videoExts',
  audio: 'audioExts',
  document: 'documentExts'
}

/** 设置项文本 → 扩展名集合：逗号/空白分隔、去点、小写、去重。空文本 = 回落默认表。 */
export function parseExtList(text: string, fallback: readonly string[]): string[] {
  const list = [
    ...new Set(
      text
        .split(/[,;，；\s]+/)
        .map((s) => s.trim().replace(/^\.+/, '').toLowerCase())
        .filter((s) => s !== '')
    )
  ]
  return list.length > 0 ? list : [...fallback]
}

/** 设置项的缺省文本（设置页 schema default 与 setup 回落共用）。 */
export function defaultExtText(t: FilterableMediaType): string {
  return DEFAULT_EXTS[t].join(', ')
}

let activeMap: Record<MediaType, readonly string[]> = { ...DEFAULT_EXTS, other: [] }

/** 运行时映射的唯一写入口（mediaTypeFilter 的 setup 在启动与设置变更时调用）。 */
export function setMediaTypeMap(map: Record<FilterableMediaType, string[]>): void {
  activeMap = { ...map, other: [] }
}

/** 展示推导：扩展名 → 类别（未命中任何集合 = other）。viewModel 透传给条目视图。 */
export function mediaTypeOf(ext: string | null): MediaType {
  if (ext == null) return 'other'
  const e = ext.toLowerCase()
  for (const t of FILTERABLE_MEDIA_TYPES) {
    if (activeMap[t].includes(e)) return t
  }
  return 'other'
}

/** 类别集合 → 查询用扩展名集（ItemsQuery.extensions；顺序稳定便于校验与测试）。 */
export function extensionsFor(types: readonly FilterableMediaType[]): string[] {
  const set = new Set<string>()
  for (const t of types) {
    for (const e of activeMap[t]) set.add(e)
  }
  return [...set]
}
