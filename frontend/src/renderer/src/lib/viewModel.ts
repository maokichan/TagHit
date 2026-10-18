/**
 * 视图模型适配器：契约形状（Item/ItemHit/ProjectedHit）→ 网格/详情页可渲染的 ItemView。
 *
 * - 扩展名是**展示推导**（标题文件名后缀）；媒体类别由可配置映射推导（lib/mediaTypes.ts），
 *   本文件透传类型与推导函数，消费方 import 不变；
 * - width/height/previewUri（派生元数据，D16 抓帧回写）在契约内、随 ItemView 透传；
 *   EAV 长尾元数据未建模（词表留位），卡片信息只到核心事实为止。
 */

import type { Id, Item, ItemStatus, Tag } from '@shared/contract'
import { mediaTypeOf, type MediaType } from './mediaTypes'

export type { MediaType }
export { mediaTypeOf }

export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  return name.slice(dot + 1).toLowerCase()
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
  /** 缩略图缓存绝对路径（{userData}/thumbnails，运行时生成；无 → null） */
  previewUri: string | null
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
    previewUri: isFile ? (item.previewUri ?? null) : null,
    tags: hit.tags,
    hiddenCount: hit.hiddenCount ?? 0
  }
}
