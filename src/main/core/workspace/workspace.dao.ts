import type { AppDb } from '../../db/connection'
import type { Workspace, WorkspacePath, WorkspaceWithPaths } from '@shared/types/workspace'

/** 规范化路径（Windows 大小写不敏感 + 统一分隔符 + 去尾部斜杠） */
function normPath(p: string): string {
  const lower = process.platform === 'win32' ? p.toLowerCase() : p
  return lower.replace(/\//g, '\\').replace(/[\\]+$/, '')
}

/** source_uri 是否位于某扫描路径下（含路径自身） */
export function isUnderPath(sourceUri: string, root: string): boolean {
  const s = normPath(sourceUri)
  const r = normPath(root)
  return s === r || s.startsWith(r + '\\')
}

interface WorkspaceRow {
  id: number
  title: string
  created_at: string
  updated_at: string
  cover_path: string | null
}

interface PathRow {
  id: number
  workspace_id: number
  path: string
  recursive: number
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    coverPath: row.cover_path ?? null
  }
}

/** 封面展示地址：用户指定 coverPath 优先，否则取工作区内第一张图（缩略图 → 原图） */
export function resolveCoverUri(
  db: AppDb,
  ws: Workspace,
  imageExts: string[]
): string | null {
  if (ws.coverPath) return ws.coverPath
  if (imageExts.length === 0) return null
  const placeholders = imageExts.map(() => '?').join(',')
  const thumb = db.read
    .prepare(
      `SELECT i.preview_uri AS uri FROM item i
       JOIN workspace_item wi ON wi.item_id = i.id
       WHERE wi.workspace_id = ? AND i.preview_uri IS NOT NULL AND i.extension IN (${placeholders})
       ORDER BY i.updated_at DESC LIMIT 1`
    )
    .get(ws.id, ...imageExts) as { uri: string } | undefined
  if (thumb) return thumb.uri
  const src = db.read
    .prepare(
      `SELECT i.source_uri AS uri FROM item i
       JOIN workspace_item wi ON wi.item_id = i.id
       WHERE wi.workspace_id = ? AND i.source_uri IS NOT NULL AND i.extension IN (${placeholders})
       ORDER BY i.updated_at DESC LIMIT 1`
    )
    .get(ws.id, ...imageExts) as { uri: string } | undefined
  return src?.uri ?? null
}

export const workspaceDao = {
  list(db: AppDb, imageExts: string[]): WorkspaceWithPaths[] {
    const workspaces = db.read
      .prepare('SELECT * FROM workspace ORDER BY updated_at DESC')
      .all() as WorkspaceRow[]
    const paths = db.read
      .prepare('SELECT * FROM workspace_path ORDER BY id')
      .all() as PathRow[]
    const pathsByWs = new Map<number, WorkspacePath[]>()
    for (const p of paths) {
      const list = pathsByWs.get(p.workspace_id) ?? []
      list.push({ id: p.id, workspaceId: p.workspace_id, path: p.path, recursive: p.recursive === 1 })
      pathsByWs.set(p.workspace_id, list)
    }
    return workspaces.map((w) => {
      const ws = rowToWorkspace(w)
      return { ...ws, paths: pathsByWs.get(w.id) ?? [], coverUri: resolveCoverUri(db, ws, imageExts) }
    })
  },

  getById(db: AppDb, id: number): Workspace | null {
    const row = db.read.prepare('SELECT * FROM workspace WHERE id = ?').get(id) as
      | WorkspaceRow
      | undefined
    return row ? rowToWorkspace(row) : null
  },

  setCover(db: AppDb, id: number, coverPath: string | null): void {
    db.write.prepare('UPDATE workspace SET cover_path = ? WHERE id = ?').run(coverPath, id)
  },

  create(db: AppDb, title: string): Workspace {
    const now = new Date().toISOString()
    const info = db.write
      .prepare('INSERT INTO workspace (title, created_at, updated_at) VALUES (?, ?, ?)')
      .run(title, now, now)
    return workspaceDao.getById(db, Number(info.lastInsertRowid)) as Workspace
  },

  update(db: AppDb, id: number, title: string): Workspace {
    db.write
      .prepare('UPDATE workspace SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, new Date().toISOString(), id)
    return workspaceDao.getById(db, id) as Workspace
  },

  delete(db: AppDb, id: number): void {
    db.write.prepare('DELETE FROM workspace WHERE id = ?').run(id)
  },

  listPaths(db: AppDb, workspaceId: number): WorkspacePath[] {
    const rows = db.read
      .prepare('SELECT * FROM workspace_path WHERE workspace_id = ? ORDER BY id')
      .all(workspaceId) as PathRow[]
    return rows.map((r) => ({ id: r.id, workspaceId: r.workspace_id, path: r.path, recursive: r.recursive === 1 }))
  },

  addPath(db: AppDb, workspaceId: number, path: string, recursive: boolean): WorkspacePath {
    const info = db.write
      .prepare('INSERT OR IGNORE INTO workspace_path (workspace_id, path, recursive) VALUES (?, ?, ?)')
      .run(workspaceId, path, recursive ? 1 : 0)
    const row = db.read
      .prepare('SELECT * FROM workspace_path WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as PathRow | undefined
    if (!row) {
      // 已存在（INSERT OR IGNORE）：按唯一键取回
      const existing = db.read
        .prepare('SELECT * FROM workspace_path WHERE workspace_id = ? AND path = ?')
        .get(workspaceId, path) as PathRow
      return { id: existing.id, workspaceId: existing.workspace_id, path: existing.path, recursive: existing.recursive === 1 }
    }
    return { id: row.id, workspaceId: row.workspace_id, path: row.path, recursive: row.recursive === 1 }
  },

  removePath(db: AppDb, pathId: number): void {
    db.write.prepare('DELETE FROM workspace_path WHERE id = ?').run(pathId)
  },

  /** 移除某路径后：把该路径下的条目从工作区脱离（保留全局 item / 标签 / 元数据） */
  detachItemsUnderPath(db: AppDb, workspaceId: number, rootPath: string): number {
    const rows = db.read
      .prepare(
        `SELECT wi.item_id AS item_id, i.source_uri AS source_uri
         FROM workspace_item wi JOIN item i ON i.id = wi.item_id
         WHERE wi.workspace_id = ?`
      )
      .all(workspaceId) as { item_id: number; source_uri: string | null }[]
    const targets = rows.filter((r) => r.source_uri && isUnderPath(r.source_uri, rootPath))
    if (targets.length === 0) return 0
    const del = db.write.prepare(
      'DELETE FROM workspace_item WHERE workspace_id = ? AND item_id = ?'
    )
    const tx = db.write.transaction(() => {
      for (const t of targets) del.run(workspaceId, t.item_id)
    })
    tx()
    return targets.length
  },

  recordScanHistory(
    db: AppDb,
    workspaceId: number,
    scanType: string,
    result: { filesAdded: number; filesUpdated: number; filesMarkedMissing: number; errors: number; durationMs: number }
  ): void {
    db.write
      .prepare(
        `INSERT INTO scan_history (id, workspace_id, scan_type, files_added, files_updated, files_marked_missing, errors, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        workspaceId,
        scanType,
        result.filesAdded,
        result.filesUpdated,
        result.filesMarkedMissing,
        result.errors,
        new Date(Date.now() - result.durationMs).toISOString(),
        new Date().toISOString()
      )
  }
}
