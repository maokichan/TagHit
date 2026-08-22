import type { AppDb } from '../../db/connection'
import type { Workspace, WorkspacePath } from '@shared/types/workspace'

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

function rowToPath(row: PathRow): WorkspacePath {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    path: row.path,
    recursive: row.recursive === 1
  }
}

export const workspaceDao = {
  /** 全部工作区（原始数据；封面策略在 WorkspaceService） */
  list(db: AppDb): Workspace[] {
    const rows = db.read.prepare('SELECT * FROM workspace ORDER BY updated_at DESC').all() as WorkspaceRow[]
    return rows.map(rowToWorkspace)
  },

  /** 全部路径（原始数据，service 按工作区分组） */
  listAllPaths(db: AppDb): WorkspacePath[] {
    const rows = db.read.prepare('SELECT * FROM workspace_path ORDER BY id').all() as PathRow[]
    return rows.map(rowToPath)
  },

  getById(db: AppDb, id: number): Workspace | null {
    const row = db.read.prepare('SELECT * FROM workspace WHERE id = ?').get(id) as
      | WorkspaceRow
      | undefined
    return row ? rowToWorkspace(row) : null
  },

  getPathById(db: AppDb, pathId: number, workspaceId: number): WorkspacePath | null {
    const row = db.read
      .prepare('SELECT * FROM workspace_path WHERE id = ? AND workspace_id = ?')
      .get(pathId, workspaceId) as PathRow | undefined
    return row ? rowToPath(row) : null
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
    return rows.map(rowToPath)
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
      return rowToPath(existing)
    }
    return rowToPath(row)
  },

  removePath(db: AppDb, pathId: number): void {
    db.write.prepare('DELETE FROM workspace_path WHERE id = ?').run(pathId)
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
