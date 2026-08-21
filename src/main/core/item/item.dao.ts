import { dirname } from 'path'
import { existsSync } from 'fs'
import type { AppDb } from '../../db/connection'
import type { Tag } from '@shared/types/tag'
import type { Item, ItemFilter, ItemMetadata, ItemWithTags } from '@shared/types/item'
import type { AppConfig } from '@shared/types/config'
import { isUnderPath } from '../workspace/workspace.dao'
import { isThumbPath } from '../thumbnail/thumbnail.service'

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

export function resolveMediaType(extension: string | null, config: AppConfig): string {
  if (!extension) return 'other'
  return config.fileFormatMap[extension.toLowerCase()] ?? 'other'
}

/** 排序字段白名单 → 安全列名（防注入，只允许固定映射） */
const SORT_COLUMNS: Record<string, string> = {
  updatedAt: 'i.updated_at',
  name: 'i.title',
  size: 'i.size',
  modifiedAt: 'i.file_modified_at',
  addedAt: 'i.created_at',
  type: 'i.extension'
}

function buildOrderBy(sortBy: string | undefined, sortDir: 'asc' | 'desc' | undefined): string {
  const col = sortBy ? SORT_COLUMNS[sortBy] : undefined
  if (!col) return 'i.updated_at DESC'
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
  // 附加 updated_at 作稳定次级排序
  return `${col} ${dir}, i.updated_at DESC`
}

/** 取一批 item 的宽高（item_metadata EAV，用于比例瀑布流/列表展示） */
function dimsForItems(db: AppDb, itemIds: number[]): Map<number, { width: number | null; height: number | null }> {
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
function tagsForItems(db: AppDb, workspaceId: number, itemIds: number[]): Map<number, Tag[]> {
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
function tagsForItemsGlobal(db: AppDb, itemIds: number[]): Map<number, Tag[]> {
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

export const itemDao = {
  getById(db: AppDb, id: number): Item | null {
    const row = db.read.prepare('SELECT * FROM item WHERE id = ?').get(id) as ItemRow | undefined
    return row ? rowToItem(row) : null
  },

  /**
   * 列出某工作区内的条目，支持标签交集 / 媒体类别 / 关键词 / 状态过滤，分页。
   */
  list(db: AppDb, filter: ItemFilter, config: AppConfig): { items: ItemWithTags[]; total: number } {
    const where: string[] = [
      'i.id IN (SELECT item_id FROM workspace_item WHERE workspace_id = ?)'
    ]
    const params: unknown[] = [filter.workspaceId]

    if (filter.tagIds && filter.tagIds.length > 0) {
      for (const tagId of filter.tagIds) {
        where.push(
          'i.id IN (SELECT item_id FROM item_tag WHERE workspace_id = ? AND tag_id = ?)'
        )
        params.push(filter.workspaceId, tagId)
      }
    }

    if (filter.mediaType) {
      const exts = Object.entries(config.fileFormatMap)
        .filter(([, v]) => v === filter.mediaType)
        .map(([k]) => k)
      if (exts.length > 0) {
        where.push(`i.extension IN (${exts.map(() => '?').join(',')})`)
        params.push(...exts)
      }
    }

    if (filter.keyword) {
      where.push('i.title LIKE ?')
      params.push(`%${filter.keyword}%`)
    }

    if (filter.dateFrom) {
      where.push('(i.file_modified_at IS NULL OR i.file_modified_at >= ?)')
      params.push(filter.dateFrom)
    }

    if (filter.dateTo) {
      where.push('(i.file_modified_at IS NULL OR i.file_modified_at <= ?)')
      params.push(filter.dateTo)
    }

    if (filter.status) {
      where.push('i.status = ?')
      params.push(filter.status)
    }

    const whereSql = where.join(' AND ')
    const total = (
      db.read.prepare(`SELECT COUNT(*) AS c FROM item i WHERE ${whereSql}`).get(...params) as {
        c: number
      }
    ).c

    const limit = filter.limit ?? 200
    const offset = filter.offset ?? 0
    const orderBy = buildOrderBy(filter.sortBy, filter.sortDir)
    const rows = db.read
      .prepare(
        `SELECT i.* FROM item i WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as ItemRow[]

    const items = rows.map((r) => rowToItem(r))
    const tagMap = tagsForItems(db, filter.workspaceId, items.map((i) => i.id))
    const dims = dimsForItems(db, items.map((i) => i.id))
    const result: ItemWithTags[] = items.map((i) => ({
      ...i,
      mediaType: resolveMediaType(i.extension, config),
      tags: tagMap.get(i.id) ?? [],
      width: dims.get(i.id)?.width ?? null,
      height: dims.get(i.id)?.height ?? null,
      // 仅暴露缩略图路径；原图直出 → null（渲染层懒生成缩略图，避免全分辨率解码）
      previewUri: isThumbPath(i.previewUri) ? i.previewUri : null
    }))

    return { items: result, total }
  },

  /**
   * 全局搜索（跨工作区）：不限定工作区，标签命中=条目在任一工作区拥有该标签。
   */
  listGlobal(
    db: AppDb,
    filter: {
      tagIds?: number[]
      mediaType?: string
      keyword?: string
      dateFrom?: string
      dateTo?: string
      limit?: number
      offset?: number
      sortBy?: string
      sortDir?: 'asc' | 'desc'
    },
    config: AppConfig
  ): { items: ItemWithTags[]; total: number } {
    const where: string[] = []
    const params: unknown[] = []

    if (filter.tagIds && filter.tagIds.length > 0) {
      for (const tagId of filter.tagIds) {
        where.push('i.id IN (SELECT item_id FROM item_tag WHERE tag_id = ?)')
        params.push(tagId)
      }
    }

    if (filter.mediaType) {
      const exts = Object.entries(config.fileFormatMap)
        .filter(([, v]) => v === filter.mediaType)
        .map(([k]) => k)
      if (exts.length > 0) {
        where.push(`i.extension IN (${exts.map(() => '?').join(',')})`)
        params.push(...exts)
      }
    }

    if (filter.keyword) {
      where.push('i.title LIKE ?')
      params.push(`%${filter.keyword}%`)
    }

    if (filter.dateFrom) {
      where.push('(i.file_modified_at IS NULL OR i.file_modified_at >= ?)')
      params.push(filter.dateFrom)
    }

    if (filter.dateTo) {
      where.push('(i.file_modified_at IS NULL OR i.file_modified_at <= ?)')
      params.push(filter.dateTo)
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const total = (
      db.read.prepare(`SELECT COUNT(*) AS c FROM item i ${whereSql}`).get(...params) as { c: number }
    ).c

    const limit = filter.limit ?? 200
    const offset = filter.offset ?? 0
    const orderBy = buildOrderBy(filter.sortBy, filter.sortDir)
    const rows = db.read
      .prepare(
        `SELECT i.* FROM item i ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as ItemRow[]

    const items = rows.map((r) => rowToItem(r))
    const tagMap = tagsForItemsGlobal(db, items.map((i) => i.id))
    const dims = dimsForItems(db, items.map((i) => i.id))

    // 附带条目所属工作区（全局搜索结果点击进详情用）
    const wsMap = new Map<number, number[]>()
    if (items.length > 0) {
      const placeholders = items.map(() => '?').join(',')
      const wsRows = db.read
        .prepare(
          `SELECT item_id, workspace_id FROM workspace_item WHERE item_id IN (${placeholders})`
        )
        .all(...items.map((i) => i.id)) as { item_id: number; workspace_id: number }[]
      for (const r of wsRows) {
        wsMap.set(r.item_id, [...(wsMap.get(r.item_id) ?? []), r.workspace_id])
      }
    }

    const result: ItemWithTags[] = items.map((i) => ({
      ...i,
      mediaType: resolveMediaType(i.extension, config),
      tags: tagMap.get(i.id) ?? [],
      width: dims.get(i.id)?.width ?? null,
      height: dims.get(i.id)?.height ?? null,
      previewUri: isThumbPath(i.previewUri) ? i.previewUri : null,
      workspaceIds: wsMap.get(i.id) ?? []
    }))
    return { items: result, total }
  },

  getWithTags(db: AppDb, id: number, workspaceId: number, config: AppConfig): ItemWithTags | null {
    const item = itemDao.getById(db, id)
    if (!item) return null
    const tags = tagsForItems(db, workspaceId, [id]).get(id) ?? []
    const metadata = itemDao.listMetadata(db, id)
    return { ...item, mediaType: resolveMediaType(item.extension, config), tags, metadata }
  },

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

  /**
   * 扫描收尾：本工作区关联但本次未出现的条目，按现实状态处理：
   *  - 已不在任何配置路径下（路径被移除/收窄）→ 从工作区脱离（保留全局条目/标签/元数据）
   *  - 仍在配置路径内但文件未出现：所在目录还存在 → 标记 missing（已 missing 则保持）；目录也没了 → 脱离
   * 目录存在性按父目录批量缓存判存，避免逐文件 stat。
   */
  finalizeScanStatus(
    db: AppDb,
    workspaceId: number,
    seenUris: Set<string>,
    currentPaths: string[]
  ): { markedMissing: number; detached: number } {
    const rows = db.read
      .prepare(
        `SELECT i.id AS id, i.source_uri AS source_uri, i.status AS status FROM item i
         JOIN workspace_item wi ON wi.item_id = i.id
         WHERE wi.workspace_id = ?`
      )
      .all(workspaceId) as { id: number; source_uri: string | null; status: string }[]

    const toMissing: number[] = []
    const toDetach: number[] = []
    const dirExistsCache = new Map<string, boolean>()

    for (const r of rows) {
      if (r.source_uri && seenUris.has(r.source_uri)) continue // 本次已见，upsert 已置 active
      if (!r.source_uri) {
        toDetach.push(r.id)
        continue
      }
      const underPath = currentPaths.some((p) => isUnderPath(r.source_uri as string, p))
      if (!underPath) {
        toDetach.push(r.id) // 已不在任何配置路径 → 脱离（含历史遗留的 missing 条目）
        continue
      }
      // 在路径内但本次未见：目录还在 → 缺失（已是 missing 则保持）；目录也没了 → 脱离
      const dir = dirname(r.source_uri)
      let exists = dirExistsCache.get(dir)
      if (exists === undefined) {
        exists = existsSync(dir)
        dirExistsCache.set(dir, exists)
      }
      if (exists) {
        if (r.status !== 'missing') toMissing.push(r.id)
      } else {
        toDetach.push(r.id)
      }
    }

    if (toMissing.length === 0 && toDetach.length === 0) return { markedMissing: 0, detached: 0 }
    const update = db.write.prepare("UPDATE item SET status = 'missing', updated_at = ? WHERE id = ?")
    const detach = db.write.prepare('DELETE FROM workspace_item WHERE workspace_id = ? AND item_id = ?')
    const tx = db.write.transaction(() => {
      const now = new Date().toISOString()
      for (const id of toMissing) update.run(now, id)
      for (const id of toDetach) detach.run(workspaceId, id)
    })
    tx()
    return { markedMissing: toMissing.length, detached: toDetach.length }
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
