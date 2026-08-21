import type { AppDb } from '../../db/connection'
import type { ConfigService } from '../config'
import type { SearchRequest, SearchResult } from '@shared/types/search'
import { parseSearchQuery } from './parser'
import { tagDao } from '../tag/tag.dao'
import { itemDao } from '../item/item.dao'

/**
 * SearchService —— 解析 DSL → 标签倒排交集 → 条目过滤 → 分页。
 * 标签交集走 idx_item_tag_tag 倒排索引（标签→条目），命中后按其余条件过滤。
 * 配置动态读取，fileFormatMap 变更即时生效。
 */
export class SearchService {
  constructor(
    private readonly db: AppDb,
    private readonly config: ConfigService
  ) {}

  query(req: SearchRequest): SearchResult {
    const cfg = this.config.get()
    const parsed = parseSearchQuery(req.query)
    const workspaceId = parsed.workspaceId ?? req.workspaceId
    // 搜索必须处于某个工作区（沿用旧版语义：无工作区返回空）
    if (!workspaceId) return { items: [], total: 0 }

    // 标签 → 倒排交集（仅限当前工作区已声明的标签：未声明 → 搜不到）
    let tagIds: number[] | null = null
    if (parsed.tags.length > 0) {
      const sets: Set<number>[] = []
      for (const name of parsed.tags) {
        const tag = tagDao.getByName(this.db, name)
        if (!tag) return { items: [], total: 0 } // 任一标签不存在 → 空结果
        if (!tagDao.isDeclared(this.db, workspaceId, tag.id)) {
          // 该标签存在但当前工作区未声明 → 不可搜索
          return { items: [], total: 0 }
        }
        const rows = this.db.read
          .prepare(
            'SELECT item_id FROM item_tag WHERE workspace_id = ? AND tag_id = ?'
          )
          .all(workspaceId, tag.id) as { item_id: number }[]
        sets.push(new Set(rows.map((r) => r.item_id)))
      }
      const [first, ...rest] = sets
      tagIds = [...first].filter((id) => rest.every((s) => s.has(id)))
      if (tagIds.length === 0) return { items: [], total: 0 }
    }

    // type: 取第一个 media 类别作为媒体类型过滤（来源类型暂不参与过滤）
    const mediaType = parsed.types.find((t) => ['image', 'video', 'audio', 'document'].includes(t))

    const { items, total } = itemDao.list(
      this.db,
      {
        workspaceId,
        tagIds: tagIds ?? undefined,
        mediaType,
        keyword: parsed.keyword ?? undefined,
        dateFrom: parsed.dateFrom ?? undefined,
        dateTo: parsed.dateTo ?? undefined,
        limit: req.limit ?? 200,
        offset: req.offset ?? 0
      },
      cfg
    )

    return { items, total }
  }

  /** 全局搜索（开始界面）：跨工作区检索，标签命中=条目在任一工作区拥有该标签 */
  globalQuery(req: SearchRequest): SearchResult {
    const cfg = this.config.get()
    const parsed = parseSearchQuery(req.query)

    let tagIds: number[] | null = null
    if (parsed.tags.length > 0) {
      const sets: Set<number>[] = []
      for (const name of parsed.tags) {
        const tag = tagDao.getByName(this.db, name)
        if (!tag) return { items: [], total: 0 }
        const rows = this.db.read
          .prepare('SELECT item_id FROM item_tag WHERE tag_id = ?')
          .all(tag.id) as { item_id: number }[]
        sets.push(new Set(rows.map((r) => r.item_id)))
      }
      const [first, ...rest] = sets
      tagIds = [...first].filter((id) => rest.every((s) => s.has(id)))
      if (tagIds.length === 0) return { items: [], total: 0 }
    }

    const mediaType = parsed.types.find((t) => ['image', 'video', 'audio', 'document'].includes(t))
    const { items, total } = itemDao.listGlobal(
      this.db,
      {
        tagIds: tagIds ?? undefined,
        mediaType,
        keyword: parsed.keyword ?? undefined,
        dateFrom: parsed.dateFrom ?? undefined,
        dateTo: parsed.dateTo ?? undefined,
        limit: req.limit ?? 200,
        offset: req.offset ?? 0
      },
      cfg
    )
    return { items, total }
  }
}
