import type { AppDb } from '../../db/connection'
import type { Tag } from '@shared/types/tag'
import type { Item, ItemMetadata, ItemStatus } from '@shared/types/item'

interface ItemRow {
  id: number
  title: string
  extension: string | null
  item_type: string
  source_uri: string | null
  preview_uri: string | null
  content_hash: string | null
  size: number | null
  captured_at: string | null
  file_modified_at: string | null
  status: string
  created_at: string
  updated_at: string
}

function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    title: row.title,
    extension: row.extension,
    itemType: row.item_type as Item['itemType'],
    sourceUri: row.source_uri,
    previewUri: row.preview_uri,
    contentHash: row.content_hash,
    size: row.size,
    capturedAt: row.captured_at,
    fileModifiedAt: row.file_modified_at,
    status: row.status as Item['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 列表查询参数（纯数据访问，不含业务映射；排序列由 service 白名单解析后传入） */
export interface ListOptions {
  workspaceId: number
  tagIds?: number[]
  /** service 已按 mediaType 换算好的扩展名列表（空/缺省 = 不过滤类别） */
  extList?: string[]
  keyword?: string
  status?: ItemStatus
  dateFrom?: string
  dateTo?: string
  /** 白名单解析后的安全列名（如 'i.updated_at'），非法值由 service 兜底 */
  orderBy: string
  orderDir: 'asc' | 'desc'
  limit: number
  offset: number
}

/** 取一批 item 的宽高（item_metadata EAV，用于比例瀑布流/列表展示） */
function loadDims(db: AppDb, itemIds: number[]): Map<number, { width: number | null; height: number | null }> {
  const map = new Map<number, { width: number | null; height: number | null }>()
  if (itemIds.length === 0) return map
  const placeholders = itemIds.map(() => '?').join(',')
  const rows = db.read
    .prepare(
      `SELECT item_id, key, value FROM item_metadata
       WHERE item_id IN (${placeholders}) AND key IN ('width', 'height')`
    )
    .all(...itemIds) as { item_id: number; key: string; value: string }[]
  for (const r of rows) {
    const entry = map.get(r.item_id) ?? { width: null, height: null }
    if (r.key === 'width') entry.width = Number(r.value) || null
    else entry.height = Number(r.value) || null
    map.set(r.item_id, entry)
  }
  return map
}

/** 取一批 item 在工作区内的标签（倒排查询） */
function loadTags(db: AppDb, workspaceId: number, itemIds: number[]): Map<number, Tag[]> {
  const map = new Map<number, Tag[]>()
  if (itemIds.length === 0) return map
  const placeholders = itemIds.map(() => '?').join(',')
  const rows = db.read
    .prepare(
      `SELECT it.item_id AS item_id, t.id AS id, t.name AS name
       FROM item_tag it JOIN tag t ON t.id = it.tag_id
       WHERE it.workspace_id = ? AND it.item_id IN (${placeholders})
       ORDER BY t.name COLLATE NOCASE`
    )
    .all(workspaceId, ...itemIds) as { item_id: number; id: number; name: string }[]
  for (const r of rows) {
    const list = map.get(r.item_id) ?? []
    list.push({ id: r.id, name: r.name, description: null, createdAt: '', updatedAt: '' })
    map.set(r.item_id, list)
  }
  return map
}

/** 取一批 item 在【任意工作区】的标签（全局搜索结果用） */
function loadTagsGlobal(db: AppDb, itemIds: number[]): Map<number, Tag[]> {
  const map = new Map<number, Tag[]>()
  if (itemIds.length === 0) return map
  const placeholders = itemIds.map(() => '?').join(',')
  const rows = db.read
    .prepare(
      `SELECT it.item_id AS item_id, t.id AS id, t.name AS name
       FROM item_tag it JOIN tag t ON t.id = it.tag_id
       WHERE it.item_id IN (${placeholders})
       ORDER BY t.name COLLATE NOCASE`
    )
    .all(...itemIds) as { item_id: number; id: number; name: string }[]
  for (const r of rows) {
    const list = map.get(r.item_id) ?? []
    list.push({ id: r.id, name: r.name, description: null, createdAt: '', updatedAt: '' })
    map.set(r.item_id, list)
  }
  return map
}

/** 标签倒排交集：命中全部 tagIds 的 item_id 列表（workspaceId 为空 = 跨工作区） */
export function listByTagIntersection(
  db: AppDb,
  workspaceId: number | null,
  tagIds: number[]
): number[] {
  if (tagIds.length === 0) return []
  const sets: Set<number>[] = []
  for (const tagId of tagIds) {
    const rows = workspaceId == null
      ? (db.read
          .prepare('SELECT item_id FROM item_tag WHERE tag_id = ?')
          .all(tagId) as { item_id: number }[])
      : (db.read
          .prepare('SELECT item_id FROM item_tag WHERE workspace_id = ? AND tag_id = ?')
          .all(workspaceId, tagId) as { item_id: number }[])
    sets.push(new Set(rows.map((r) => r.item_id)))
  }
  const [first, ...rest] = sets
  if (!first) return []
  return [...first].filter((id) => rest.every((s) => s.has(id)))
}

export const itemDao = {
  getById(db: AppDb, id: number): Item | null {
    const row = db.read.prepare('SELECT * FROM item WHERE id = ?').get(id) as ItemRow | undefined
    return row ? rowToItem(row) : null
  },

  /**
   * 列出某工作区内的条目（原始行，不含业务映射——媒体类型/原图策略由 ItemService 组装）。
   */
  list(db: AppDb, opts: ListOptions): { items: Item[]; total: number } {
    const where: string[] = [
      'i.id IN (SELECT item_id FROM workspace_item WHERE workspace_id = ?)'
    ]
    const params: unknown[] = [opts.workspaceId]

    if (opts.tagIds && opts.tagIds.length > 0) {
      for (const tagId of opts.tagIds) {
        where.push(
          'i.id IN (SELECT item_id FROM item_tag WHERE workspace_id = ? AND tag_id = ?)'
        )
        params.push(opts.workspaceId, tagId)
      }
    }

    if (opts.extList && opts.extList.length > 0) {
      where.push(`i.extension IN (${opts.extList.map(() => '?').join(',')})`)
      params.push(...opts.extList)
    }

    if (opts.keyword) {
      where.push('i.title LIKE ?')
      params.push(`%${opts.keyword}%`)
    }

    if (opts.dateFrom) {
      where.push('(i.file_modified_at IS NULL OR i.file_modified_at >= ?)')
      params.push(opts.dateFrom)
    }

    if (opts.dateTo) {
      where.push('(i.file_modified_at IS NULL OR i.file_modified_at <= ?)')
      params.push(opts.dateTo)
    }

    if (opts.status) {
      where.push('i.status = ?')
      params.push(opts.status)
    }

    const whereSql = where.join(' AND ')
    const total = (
      db.read.prepare(`SELECT COUNT(*) AS c FROM item i WHERE ${whereSql}`).get(...params) as {
        c: number
      }
    ).c

    const dir = opts.orderDir === 'asc' ? 'ASC' : 'DESC'
    const rows = db.read
      .prepare(
        `SELECT i.* FROM item i WHERE ${whereSql} ORDER BY ${opts.orderBy} ${dir}, i.updated_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, opts.limit, opts.offset) as ItemRow[]

    return { items: rows.map((r) => rowToItem(r)), total }
  },

  /**
   * 全局搜索（跨工作区）：原始行 + 条目所属工作区 id（供详情上下文）。
   */
  listGlobal(
    db: AppDb,
    opts: Omit<ListOptions, 'workspaceId'> & { tagIds?: number[] }
  ): { items: Item[]; total: number; workspaceIds: Map<number, number[]> } {
    const where: string[] = []
    const params: unknown[] = []

    if (opts.tagIds && opts.tagIds.length > 0) {
      for (const tagId of opts.tagIds) {
        where.push('i.id IN (SELECT item_id FROM item_tag WHERE tag_id = ?)')
        params.push(tagId)
      }
    }

    if (opts.extList && opts.extList.length > 0) {
      where.push(`i.extension IN (${opts.extList.map(() => '?').join(',')})`)
      params.push(...opts.extList)
    }

    if (opts.keyword) {
      where.push('i.title LIKE ?')
      params.push(`%${opts.keyword}%`)
    }

    if (opts.dateFrom) {
      where.push('(i.file_modified_at IS NULL OR i.file_modified_at >= ?)')
      params.push(opts.dateFrom)
    }

    if (opts.dateTo) {
      where.push('(i.file_modified_at IS NULL OR i.file_modified_at <= ?)')
      params.push(opts.dateTo)
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const total = (
      db.read.prepare(`SELECT COUNT(*) AS c FROM item i ${whereSql}`).get(...params) as { c: number }
    ).c

    const dir = opts.orderDir === 'asc' ? 'ASC' : 'DESC'
    const rows = db.read
      .prepare(
        `SELECT i.* FROM item i ${whereSql} ORDER BY ${opts.orderBy} ${dir}, i.updated_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, opts.limit, opts.offset) as ItemRow[]

    const items = rows.map((r) => rowToItem(r))

    // 附带条目所属工作区（全局搜索结果点击进详情用）
    const workspaceIds = new Map<number, number[]>()
    if (items.length > 0) {
      const placeholders = items.map(() => '?').join(',')
      const wsRows = db.read
        .prepare(
          `SELECT item_id, workspace_id FROM workspace_item WHERE item_id IN (${placeholders})`
        )
        .all(...items.map((i) => i.id)) as { item_id: number; workspace_id: number }[]
      for (const r of wsRows) {
        workspaceIds.set(r.item_id, [...(workspaceIds.get(r.item_id) ?? []), r.workspace_id])
      }
    }

    return { items, total, workspaceIds }
  },

  loadTags,
  loadTagsGlobal,
  loadDims,

  listMetadata(db: AppDb, itemId: number): ItemMetadata[] {
    const rows = db.read
      .prepare('SELECT item_id, key, value FROM item_metadata WHERE item_id = ? ORDER BY key')
      .all(itemId) as { item_id: number; key: string; value: string }[]
    return rows.map((r) => ({ itemId: r.item_id, key: r.key, value: r.value }))
  },

  upsertMetadata(db: AppDb, itemId: number, entries: Record<string, string>): void {
    const upsert = db.write.prepare(
      'INSERT INTO item_metadata (item_id, key, value) VALUES (?, ?, ?) ON CONFLICT(item_id, key) DO UPDATE SET value = excluded.value'
    )
    const tx = db.write.transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        upsert.run(itemId, key, value)
      }
    })
    tx()
  },

  updateTags(db: AppDb, workspaceId: number, itemId: number, addTagIds: number[], removeTagIds: number[]): void {
    const add = db.write.prepare(
      'INSERT OR IGNORE INTO item_tag (workspace_id, item_id, tag_id) VALUES (?, ?, ?)'
    )
    const remove = db.write.prepare(
      'DELETE FROM item_tag WHERE workspace_id = ? AND item_id = ? AND tag_id = ?'
    )
    const tx = db.write.transaction(() => {
      for (const tagId of addTagIds) add.run(workspaceId, itemId, tagId)
      for (const tagId of removeTagIds) remove.run(workspaceId, itemId, tagId)
    })
    tx()
  },

  /** 扫描用：按 source_uri 查询已存在条目 */
  findBySourceUri(db: AppDb, sourceUri: string): Item | null {
    const row = db.read.prepare('SELECT * FROM item WHERE source_uri = ?').get(sourceUri) as
      | ItemRow
      | undefined
    return row ? rowToItem(row) : null
  },

  /** 扫描用：upsert 条目（存在则更新，缺失则插入并关联工作区） */
  upsertFromScan(
    db: AppDb,
    workspaceId: number,
    sourceUri: string,
    data: {
      title: string
      extension: string | null
      size: number
      contentHash: string
      fileModifiedAt: string
      previewUri: string | null
    }
  ): 'added' | 'updated' {
    const existing = itemDao.findBySourceUri(db, sourceUri)
    const now = new Date().toISOString()

    if (existing) {
      db.write
        .prepare(
          `UPDATE item SET title = ?, extension = ?, size = ?, content_hash = ?, file_modified_at = ?,
             status = 'active', updated_at = ?, preview_uri = COALESCE(?, preview_uri)
           WHERE id = ?`
        )
        .run(
          data.title,
          data.extension,
          data.size,
          data.contentHash,
          data.fileModifiedAt,
          now,
          data.previewUri,
          existing.id
        )
      db.write
        .prepare('INSERT OR IGNORE INTO workspace_item (workspace_id, item_id) VALUES (?, ?)')
        .run(workspaceId, existing.id)
      return 'updated'
    }

    const info = db.write
      .prepare(
        `INSERT INTO item (title, extension, item_type, source_uri, preview_uri, content_hash, size, file_modified_at, status, created_at, updated_at)
         VALUES (?, ?, 'local_file', ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(
        data.title,
        data.extension,
        sourceUri,
        data.previewUri,
        data.contentHash,
        data.size,
        data.fileModifiedAt,
        now,
        now
      )
    const itemId = Number(info.lastInsertRowid)
    db.write
      .prepare('INSERT OR IGNORE INTO workspace_item (workspace_id, item_id) VALUES (?, ?)')
      .run(workspaceId, itemId)
    return 'added'
  },

  /** 扫描收尾用：本工作区关联的全部条目（id + source_uri + status） */
  listWorkspaceItemUris(
    db: AppDb,
    workspaceId: number
  ): { id: number; sourceUri: string | null; status: string }[] {
    const rows = db.read
      .prepare(
        `SELECT i.id AS id, i.source_uri AS source_uri, i.status AS status FROM item i
         JOIN workspace_item wi ON wi.item_id = i.id
         WHERE wi.workspace_id = ?`
      )
      .all(workspaceId) as { id: number; source_uri: string | null; status: string }[]
    return rows.map((r) => ({ id: r.id, sourceUri: r.source_uri, status: r.status }))
  },

  /** 批量标记 missing */
  markMissing(db: AppDb, workspaceId: number, itemIds: number[]): number {
    if (itemIds.length === 0) return 0
    const update = db.write.prepare("UPDATE item SET status = 'missing', updated_at = ? WHERE id = ?")
    const tx = db.write.transaction(() => {
      const now = new Date().toISOString()
      for (const id of itemIds) update.run(now, id)
    })
    tx()
    return itemIds.length
  },

  /** 批量从工作区脱离（保留全局条目/标签/元数据，可重加路径恢复） */
  detachItems(db: AppDb, workspaceId: number, itemIds: number[]): number {
    if (itemIds.length === 0) return 0
    const detach = db.write.prepare('DELETE FROM workspace_item WHERE workspace_id = ? AND item_id = ?')
    const tx = db.write.transaction(() => {
      for (const id of itemIds) detach.run(workspaceId, id)
    })
    tx()
    return itemIds.length
  },

  /** 孤儿条目数：已无任何工作区关联的全局条目（脱离路径后残留） */
  countOrphans(db: AppDb): number {
    const row = db.read
      .prepare(
        `SELECT COUNT(*) AS c FROM item i
         WHERE NOT EXISTS (SELECT 1 FROM workspace_item wi WHERE wi.item_id = i.id)`
      )
      .get() as { c: number }
    return row.c
  },

  /** 批量删除孤儿条目（FK 级联清理 item_tag / item_metadata / workspace_item 关联） */
  deleteOrphans(db: AppDb, limit: number): number {
    const rows = db.read
      .prepare(
        `SELECT i.id AS id FROM item i
         WHERE NOT EXISTS (SELECT 1 FROM workspace_item wi WHERE wi.item_id = i.id)
         LIMIT ?`
      )
      .all(limit) as { id: number }[]
    if (rows.length === 0) return 0
    const del = db.write.prepare('DELETE FROM item WHERE id = ?')
    const tx = db.write.transaction(() => {
      for (const r of rows) del.run(r.id)
    })
    tx()
    return rows.length
  }
}
