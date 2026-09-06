/**
 * 视图模型适配器：契约形状（Item/ItemHit/ProjectedHit）→ 网格/详情页可渲染的 ItemView。
 *
 * - 扩展名 / 媒体类别是**展示推导**（从标题文件名后缀），不涉及数据过滤语义；
 * - 旧版 width/height/previewUri/metadata（EAV）不在契约 v0，ItemView 不含这些字段，
 *   卡片以图标占位、瀑布流退化为统一比例。
 */

import type { Id, Item, ItemStatus, Tag } from '@shared/contract'

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'other'

const EXT_MEDIA: Record<string, MediaType> = {}
for (const ext of [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'heic'
]) EXT_MEDIA[ext] = 'image'
for (const ext of ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'm4v']) EXT_MEDIA[ext] = 'video'
for (const ext of ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma']) EXT_MEDIA[ext] = 'audio'
for (const ext of [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'markdown', 'csv', 'rtf'
]) EXT_MEDIA[ext] = 'document'

export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  return name.slice(dot + 1).toLowerCase()
}

export function mediaTypeOf(ext: string | null): MediaType {
  return (ext != null && EXT_MEDIA[ext]) || 'other'
}

/** 网格/详情页消费的条目视图。 */
export interface ItemView {
  id: Id
  kind: Item['kind']
  title: string
  status: ItemStatus | null
  sourceUri: string | null
  contentHash: string | null
  size: number | null
  fileModifiedAt: string | null
  createdAt: string
  extension: string | null
  mediaType: MediaType
  /** 媒体固有尺寸（扫描时从文件头解析；未解析/不适用 → null） */
  width: number | null
  height: number | null
  tags: Tag[]
  /** 工作区投影未交付的标签数（全局搜索结果恒为 0） */
  hiddenCount: number
}

export function toItemView(hit: { item: Item; tags: Tag[]; hiddenCount?: number }): ItemView {
  const item = hit.item
  const isFile = item.kind === 'file'
  const ext = isFile ? extensionOf(item.title) : null
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    status: isFile ? item.status : null,
    sourceUri: isFile ? item.sourceUri : null,
    contentHash: isFile ? item.contentHash : null,
    size: isFile ? item.size : null,
    fileModifiedAt: isFile ? item.fileModifiedAt : null,
    createdAt: item.createdAt,
    extension: ext,
    mediaType: mediaTypeOf(ext),
    width: isFile ? (item.width ?? null) : null,
    height: isFile ? (item.height ?? null) : null,
    tags: hit.tags,
    hiddenCount: hit.hiddenCount ?? 0
  }
}
