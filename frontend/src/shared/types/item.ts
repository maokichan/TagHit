import type { Tag } from './tag'

export type ItemType = 'local_file' | 'bookmark' | 'web_clip' | 'note'
export type ItemStatus = 'active' | 'missing' | 'archived'

export interface Item {
  id: number
  title: string
  extension: string | null
  itemType: ItemType
  sourceUri: string | null
  previewUri: string | null
  contentHash: string | null
  size: number | null
  capturedAt: string | null
  fileModifiedAt: string | null
  status: ItemStatus
  createdAt: string
  updatedAt: string
}

export interface ItemWithTags extends Item {
  tags: Tag[]
  /** 由扩展名 + file_format_map 推导的媒体类别：image/video/audio/document/other */
  mediaType: string
  /** 列表附带：图片/视频宽高（来自 item_metadata，用于比例瀑布流） */
  width?: number | null
  height?: number | null
  /** 详情页附带：item_metadata EAV 展开 */
  metadata?: ItemMetadata[]
  /** 全局搜索结果附带：条目所在的工作区 id 列表 */
  workspaceIds?: number[]
}

export interface ItemMetadata {
  itemId: number
  key: string
  value: string
}

/** 列表过滤参数（由 @shared 两端共用） */
export interface ItemFilter {
  workspaceId: number
  tagIds?: number[]
  mediaType?: string
  keyword?: string
  status?: ItemStatus
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
  /** 排序字段：updatedAt(默认)/name/size/modifiedAt/addedAt/type */
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export interface UpdateTagsRequest {
  workspaceId: number
  itemId: number
  addTagIds: number[]
  removeTagIds: number[]
}
