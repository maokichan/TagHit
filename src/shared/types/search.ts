import type { ItemWithTags } from './item'

/** 搜索 DSL 解析结果。语法：@tag1 @tag2 type:image >2024-01-01 <2024-12-31 keyword */
export interface ParsedSearch {
  tags: string[]
  /** media 类别（image/video/audio/document）或来源类型（bookmark/note 等） */
  types: string[]
  dateFrom: string | null
  dateTo: string | null
  workspaceId: number | null
  keyword: string | null
}

export interface SearchRequest {
  workspaceId: number
  query: string
  limit?: number
  offset?: number
}

export interface SearchResult {
  items: ItemWithTags[]
  total: number
}
