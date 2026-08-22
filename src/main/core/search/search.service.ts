import type { AppDb } from '../../db/connection'
import type { ItemService } from '../item/item.service'
import type { SearchRequest, SearchResult } from '@shared/types/search'
import { parseSearchQuery } from './parser'
import { tagDao } from '../tag/tag.dao'
import { listByTagIntersection } from '../item/item.dao'

/**
 * SearchService —— DSL 解释 + 参数组装 + 结果组装（P0.5 收拢：倒排交集 SQL 已下沉
 * itemDao.listByTagIntersection，本层不再直接拼 SQL）。
 * 标签倒排交集（走 idx_item_tag_tag 倒排索引）→ 其余条件（类别/日期/关键词）→ 分页。
 */
export class SearchService {
  constructor(
    private readonly db: AppDb,
    private readonly items: ItemService
  ) {}

  query(req: SearchRequest): SearchResult {
    const parsed = parseSearchQuery(req.query)
    const workspaceId = parsed.workspaceId ?? req.workspaceId
    // 搜索必须处于某个工作区（沿用旧版语义：无工作区返回空）
    if (!workspaceId) return { items: [], total: 0 }

    // 标签 → 倒排交集（仅限当前工作区已声明的标签：未声明 → 搜不到）
    let tagIds: number[] | null = null
    if (parsed.tags.length > 0) {
      const tags = parsed.tags.map((name) => tagDao.getByName(this.db, name))
      for (const tag of tags) {
        if (!tag) return { items: [], total: 0 } // 任一标签不存在 → 空结果
        if (!tagDao.isDeclared(this.db, workspaceId, tag.id)) {
          return { items: [], total: 0 } // 存在但当前工作区未声明 → 不可搜索
        }
      }
      tagIds = listByTagIntersection(this.db, workspaceId, tags.map((t) => (t as { id: number }).id))
      if (tagIds.length === 0) return { items: [], total: 0 }
    }

    // type: 取第一个 media 类别作为媒体类型过滤（来源类型暂不参与过滤）
    const mediaType = parsed.types.find((t) => ['image', 'video', 'audio', 'document'].includes(t))

    return this.items.list({
      workspaceId,
      tagIds: tagIds ?? undefined,
      mediaType,
      keyword: parsed.keyword ?? undefined,
      dateFrom: parsed.dateFrom ?? undefined,
      dateTo: parsed.dateTo ?? undefined,
      limit: req.limit ?? 200,
      offset: req.offset ?? 0
    })
  }

  /** 全局搜索（开始界面）：跨工作区检索，标签命中=条目在任一工作区拥有该标签 */
  globalQuery(req: SearchRequest): SearchResult {
    const parsed = parseSearchQuery(req.query)

    let tagIds: number[] | null = null
    if (parsed.tags.length > 0) {
      const tags = parsed.tags.map((name) => tagDao.getByName(this.db, name))
      for (const tag of tags) {
        if (!tag) return { items: [], total: 0 }
      }
      tagIds = listByTagIntersection(this.db, null, tags.map((t) => (t as { id: number }).id))
      if (tagIds.length === 0) return { items: [], total: 0 }
    }

    const mediaType = parsed.types.find((t) => ['image', 'video', 'audio', 'document'].includes(t))
    return this.items.listGlobal({
      tagIds: tagIds ?? undefined,
      mediaType,
      keyword: parsed.keyword ?? undefined,
      dateFrom: parsed.dateFrom ?? undefined,
      dateTo: parsed.dateTo ?? undefined,
      limit: req.limit ?? 200,
      offset: req.offset ?? 0
    })
  }
}
