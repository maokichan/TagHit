import type { AppDb } from '../../db/connection'
import type { Tag, TagHierarchy } from '@shared/types/tag'

interface TagRow {
  id: number
  name: string
  created_at: string
  updated_at: string
}

interface HierarchyRow {
  parent_tag_id: number
  child_tag_id: number
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    description: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const tagDao = {
  list(db: AppDb): Tag[] {
    const rows = db.read
      .prepare('SELECT id, name, created_at, updated_at FROM tag ORDER BY name COLLATE NOCASE')
      .all() as TagRow[]
    return rows.map(rowToTag)
  },

  getById(db: AppDb, id: number): Tag | null {
    const row = db.read
      .prepare('SELECT id, name, created_at, updated_at FROM tag WHERE id = ?')
      .get(id) as TagRow | undefined
    return row ? rowToTag(row) : null
  },

  getByName(db: AppDb, name: string): Tag | null {
    const row = db.read
      .prepare('SELECT id, name, created_at, updated_at FROM tag WHERE name = ?')
      .get(name) as TagRow | undefined
    return row ? rowToTag(row) : null
  },

  create(db: AppDb, name: string): Tag {
    const now = new Date().toISOString()
    const info = db.write
      .prepare('INSERT INTO tag (name, created_at, updated_at) VALUES (?, ?, ?)')
      .run(name, now, now)
    return tagDao.getById(db, Number(info.lastInsertRowid)) as Tag
  },

  rename(db: AppDb, id: number, name: string): Tag {
    db.write
      .prepare('UPDATE tag SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, new Date().toISOString(), id)
    return tagDao.getById(db, id) as Tag
  },

  delete(db: AppDb, id: number): void {
    db.write.prepare('DELETE FROM tag WHERE id = ?').run(id)
  },

  listHierarchy(db: AppDb): TagHierarchy[] {
    const rows = db.read
      .prepare('SELECT parent_tag_id, child_tag_id FROM tag_hierarchy')
      .all() as HierarchyRow[]
    return rows.map((r) => ({ parentId: r.parent_tag_id, childId: r.child_tag_id }))
  },

  addHierarchy(db: AppDb, parentId: number, childId: number): void {
    db.write
      .prepare(
        'INSERT OR IGNORE INTO tag_hierarchy (parent_tag_id, child_tag_id) VALUES (?, ?)'
      )
      .run(parentId, childId)
  },

  removeHierarchy(db: AppDb, parentId: number, childId: number): void {
    db.write
      .prepare('DELETE FROM tag_hierarchy WHERE parent_tag_id = ? AND child_tag_id = ?')
      .run(parentId, childId)
  },

  /** 某标签的所有父标签 id */
  parentsOf(db: AppDb, tagId: number): number[] {
    const rows = db.read
      .prepare('SELECT parent_tag_id FROM tag_hierarchy WHERE child_tag_id = ?')
      .all(tagId) as { parent_tag_id: number }[]
    return rows.map((r) => r.parent_tag_id)
  },

  /** 某标签的所有子标签 id */
  childrenOf(db: AppDb, tagId: number): number[] {
    const rows = db.read
      .prepare('SELECT child_tag_id FROM tag_hierarchy WHERE parent_tag_id = ?')
      .all(tagId) as { child_tag_id: number }[]
    return rows.map((r) => r.child_tag_id)
  },

  // ── 工作区-标签声明（workspace_tag） ─────────────────────────

  declare(db: AppDb, workspaceId: number, tagId: number): void {
    db.write
      .prepare('INSERT OR IGNORE INTO workspace_tag (workspace_id, tag_id) VALUES (?, ?)')
      .run(workspaceId, tagId)
  },

  undeclare(db: AppDb, workspaceId: number, tagId: number): void {
    db.write
      .prepare('DELETE FROM workspace_tag WHERE workspace_id = ? AND tag_id = ?')
      .run(workspaceId, tagId)
  },

  /** 某工作区已声明的标签 id */
  listDeclaredTagIds(db: AppDb, workspaceId: number): number[] {
    const rows = db.read
      .prepare('SELECT tag_id FROM workspace_tag WHERE workspace_id = ? ORDER BY tag_id')
      .all(workspaceId) as { tag_id: number }[]
    return rows.map((r) => r.tag_id)
  },

  /** 已声明某标签的工作区 id */
  listDeclaredWorkspaceIds(db: AppDb, tagId: number): number[] {
    const rows = db.read
      .prepare('SELECT workspace_id FROM workspace_tag WHERE tag_id = ? ORDER BY workspace_id')
      .all(tagId) as { workspace_id: number }[]
    return rows.map((r) => r.workspace_id)
  },

  isDeclared(db: AppDb, workspaceId: number, tagId: number): boolean {
    const row = db.read
      .prepare('SELECT 1 AS x FROM workspace_tag WHERE workspace_id = ? AND tag_id = ?')
      .get(workspaceId, tagId) as { x: number } | undefined
    return row !== undefined
  }
}
