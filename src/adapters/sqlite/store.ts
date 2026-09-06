/**
 * SQLite 适配器：实现 Store 端口（src/ports/store.ts）。
 *
 * - 驱动：同步 SQLite 驱动以最小接口注入（SyncSqlite）。缺省用 Node 内置
 *   `node:sqlite`（DatabaseSync），零第三方依赖；Electron 主进程（Node 20，
 *   无 node:sqlite）由宿主注入 better-sqlite3——两者 API 形状一致，适配层不感知。
 * - 连接可指向文件或 ':memory:'（校准一致性验证用）。
 * - 语义对齐：内存适配器同款端口全局约定——实体写严格（NOT_FOUND/CONFLICT/INVALID）、
 *   关系写幂等、读宽松、行列表按插入序（rowid）返回、名称排序用 JS 与内存适配器一致。
 * - 事务：外显 transaction → BEGIN/COMMIT/ROLLBACK；不支持嵌套；
 *   内部多语句操作（压实位置/重排）在未处于外显事务时自开短事务。
 */

import { DomainError } from '../../domain/index.ts'
import type {
  Collection,
  CollectionMember,
  Declaration,
  Group,
  GroupMember,
  Id,
  Item,
  ItemAttach,
  ItemStatus,
  NodeState,
  PathNode,
  Tag,
  TagLink,
  Workspace,
  WorkspaceRoot,
} from '../../domain/index.ts'
import type {
  ItemHit,
  ItemsQuery,
  NewCollection,
  NewGroup,
  NewTag,
  NewWorkspace,
  Store,
  TagsQuery,
} from '../../ports/store.ts'

type Row = Record<string, unknown>

/** 同步 SQLite 驱动最小接口：node:sqlite DatabaseSync 与 better-sqlite3 Database 均满足。 */
export interface SyncSqlite {
  exec(sql: string): unknown
  close(): void
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
}

function notFound(entity: string, id: Id): DomainError {
  return new DomainError('NOT_FOUND', `${entity} 不存在（${id}）`)
}

function conflict(message: string): DomainError {
  return new DomainError('CONFLICT', message)
}

function invalid(message: string): DomainError {
  return new DomainError('INVALID', message)
}

function toTag(row: Row): Tag {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    createdAt: row.createdAt as string,
  }
}

function toWorkspace(row: Row): Workspace {
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.createdAt as string,
  }
}

function toCollection(row: Row): Collection {
  return {
    id: row.id as string,
    name: row.name as string,
    anchorItemId: row.anchorItemId as string,
    createdAt: row.createdAt as string,
  }
}

function toGroup(row: Row): Group {
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.createdAt as string,
  }
}

function toItem(row: Row): Item {
  if (row.kind === 'anchor') {
    return { kind: 'anchor', id: row.id as string, title: row.title as string, createdAt: row.createdAt as string }
  }
  return {
    kind: 'file',
    id: row.id as string,
    title: row.title as string,
    sourceUri: row.sourceUri as string,
    contentHash: (row.contentHash as string | null) ?? null,
    size: row.size == null ? null : Number(row.size),
    fileModifiedAt: (row.fileModifiedAt as string | null) ?? null,
    status: (row.status as ItemStatus) ?? 'active',
    createdAt: row.createdAt as string,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
  }
}

function byNameAsc(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  createdAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tags_name ON tags (LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('file','anchor')),
  title TEXT NOT NULL,
  sourceUri TEXT,
  contentHash TEXT,
  size INTEGER,
  fileModifiedAt TEXT,
  status TEXT CHECK (status IN ('active','missing')),
  createdAt TEXT NOT NULL,
  width INTEGER,
  height INTEGER
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  anchorItemId TEXT NOT NULL REFERENCES items(id),
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaceRoots (
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  path TEXT NOT NULL,
  PRIMARY KEY (workspaceId, path)
);

CREATE TABLE IF NOT EXISTS pathNodes (
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  dirPath TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('included','excluded')),
  PRIMARY KEY (workspaceId, dirPath)
);

CREATE TABLE IF NOT EXISTS attachments (
  itemId TEXT NOT NULL REFERENCES items(id),
  tagId TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (itemId, tagId)
);

CREATE TABLE IF NOT EXISTS taglinks (
  fromId TEXT NOT NULL REFERENCES tags(id),
  toId TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (fromId, toId)
);

CREATE TABLE IF NOT EXISTS declarations (
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  tagId TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (workspaceId, tagId)
);

CREATE TABLE IF NOT EXISTS collectionMembers (
  collectionId TEXT NOT NULL REFERENCES collections(id),
  itemId TEXT NOT NULL REFERENCES items(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (collectionId, itemId)
);

CREATE TABLE IF NOT EXISTS groupMembers (
  groupId TEXT NOT NULL REFERENCES groups(id),
  tagId TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (groupId, tagId)
);
`

export class SqliteStore implements Store {
  private db: SyncSqlite
  private depth = 0

  /** 驱动由调用方注入：node:sqlite 见 nodeDriver.ts（校准/测试），better-sqlite3 由宿主注入。 */
  constructor(driver: SyncSqlite) {
    this.db = driver
    this.db.exec(SCHEMA)
    // 轻量迁移：v0.2.4 之前的库没有 items.width/height（重复加列会抛错，吞掉即可）
    try {
      this.db.exec('ALTER TABLE items ADD COLUMN width INTEGER')
    } catch {
      /* 列已存在 */
    }
    try {
      this.db.exec('ALTER TABLE items ADD COLUMN height INTEGER')
    } catch {
      /* 列已存在 */
    }
  }

  close(): void {
    this.db.close()
  }

  // ---- 事务 ---------------------------------------------------------------

  async transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    if (this.depth > 0) throw invalid('不支持嵌套事务')
    this.depth = 1
    this.db.exec('BEGIN')
    try {
      const result = await fn(this)
      this.db.exec('COMMIT')
      this.depth = 0
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      this.depth = 0
      throw error
    }
  }

  /** 内部多语句操作：外显事务内直接执行，否则自开短事务保证原子。 */
  private inTx<T>(fn: () => T): T {
    if (this.depth > 0) return fn()
    this.db.exec('BEGIN')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // ---- 标签 ---------------------------------------------------------------

  async createTag(input: NewTag): Promise<Tag> {
    const name = input.name.trim()
    if (name.length === 0) throw invalid('标签名不能为空')
    if (this.tagNameExists(name)) throw conflict(`标签名已存在：${name}`)
    if (this.idExists('tags', input.id)) throw conflict(`标签 id 重复：${input.id}`)
    const tag: Tag = { id: input.id, name, description: input.description ?? null, createdAt: input.createdAt }
    this.run('INSERT INTO tags (id, name, description, createdAt) VALUES (?,?,?,?)', [
      tag.id,
      tag.name,
      tag.description,
      tag.createdAt,
    ])
    return tag
  }

  async updateTag(id: Id, patch: { description?: string | null }): Promise<void> {
    if (!this.idExists('tags', id)) throw notFound('标签', id)
    if (patch.description !== undefined) {
      this.run('UPDATE tags SET description = ? WHERE id = ?', [patch.description, id])
    }
  }

  async deleteTag(id: Id): Promise<void> {
    if (this.run('DELETE FROM tags WHERE id = ?', [id]).changes === 0) throw notFound('标签', id)
  }

  async getTag(id: Id): Promise<Tag | null> {
    const row = this.get('SELECT * FROM tags WHERE id = ?', [id])
    return row ? toTag(row) : null
  }

  async findTagByName(name: string): Promise<Tag | null> {
    const row = this.get('SELECT * FROM tags WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))', [name])
    return row ? toTag(row) : null
  }

  async queryTags(q?: TagsQuery): Promise<Tag[]> {
    let rows: Row[]
    if (q?.ids?.length) {
      const marks = q.ids.map(() => '?').join(',')
      rows = this.all(`SELECT * FROM tags WHERE id IN (${marks})`, q.ids)
    } else {
      rows = this.all('SELECT * FROM tags', [])
    }
    const contains = q?.nameContains?.trim().toLowerCase()
    if (contains) rows = rows.filter((r) => String(r.name).toLowerCase().includes(contains))
    return rows.map(toTag).sort(byNameAsc)
  }

  // ---- 条目 ---------------------------------------------------------------

  async createItem(item: Item): Promise<Item> {
    if (this.idExists('items', item.id)) throw conflict(`条目 id 重复：${item.id}`)
    if (item.kind === 'file') {
      this.run(
        'INSERT INTO items (id, kind, title, sourceUri, contentHash, size, fileModifiedAt, status, createdAt, width, height) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [
          item.id,
          'file',
          item.title,
          item.sourceUri,
          item.contentHash,
          item.size,
          item.fileModifiedAt,
          item.status,
          item.createdAt,
          item.width ?? null,
          item.height ?? null,
        ]
      )
    } else {
      this.run('INSERT INTO items (id, kind, title, createdAt) VALUES (?,?,?,?)', [
        item.id,
        'anchor',
        item.title,
        item.createdAt,
      ])
    }
    return item
  }

  async updateItem(
    id: Id,
    patch: {
      title?: string
      status?: ItemStatus
      contentHash?: string | null
      size?: number | null
      fileModifiedAt?: string | null
      width?: number | null
      height?: number | null
    }
  ): Promise<void> {
    const row = this.get('SELECT * FROM items WHERE id = ?', [id])
    if (!row) throw notFound('条目', id)
    if (patch.title !== undefined) this.run('UPDATE items SET title = ? WHERE id = ?', [patch.title, id])
    if (row.kind === 'file') {
      if (patch.status !== undefined) this.run('UPDATE items SET status = ? WHERE id = ?', [patch.status, id])
      if (patch.contentHash !== undefined) this.run('UPDATE items SET contentHash = ? WHERE id = ?', [patch.contentHash, id])
      if (patch.size !== undefined) this.run('UPDATE items SET size = ? WHERE id = ?', [patch.size, id])
      if (patch.fileModifiedAt !== undefined) {
        this.run('UPDATE items SET fileModifiedAt = ? WHERE id = ?', [patch.fileModifiedAt, id])
      }
      if (patch.width !== undefined) this.run('UPDATE items SET width = ? WHERE id = ?', [patch.width, id])
      if (patch.height !== undefined) this.run('UPDATE items SET height = ? WHERE id = ?', [patch.height, id])
    }
  }

  async deleteItem(id: Id): Promise<void> {
    if (this.run('DELETE FROM items WHERE id = ?', [id]).changes === 0) throw notFound('条目', id)
  }

  async getItem(id: Id): Promise<Item | null> {
    const row = this.get('SELECT * FROM items WHERE id = ?', [id])
    return row ? toItem(row) : null
  }

  async queryItems(q: ItemsQuery = {}): Promise<ItemHit[]> {
    const where: string[] = []
    const params: unknown[] = []

    if (q.ids?.length) {
      where.push(`i.id IN (${q.ids.map(() => '?').join(',')})`)
      params.push(...q.ids)
    }
    if (q.kinds?.length) {
      where.push(`i.kind IN (${q.kinds.map(() => '?').join(',')})`)
      params.push(...q.kinds)
    }
    if (q.status !== undefined) {
      where.push(`i.kind = 'file' AND i.status = ?`)
      params.push(q.status)
    }
    if (q.titleContains?.trim()) {
      where.push('instr(LOWER(i.title), LOWER(?)) > 0')
      params.push(q.titleContains.trim())
    }
    if (q.sourceUriPrefix) {
      where.push(`i.kind = 'file' AND instr(i.sourceUri, ?) = 1`)
      params.push(q.sourceUriPrefix)
    }
    if (q.withAnyTag?.length) {
      where.push(`EXISTS (SELECT 1 FROM attachments a WHERE a.itemId = i.id AND a.tagId IN (${q.withAnyTag.map(() => '?').join(',')}))`)
      params.push(...q.withAnyTag)
    }
    if (q.withAllTags?.length) {
      where.push(
        `(SELECT COUNT(DISTINCT a.tagId) FROM attachments a WHERE a.itemId = i.id AND a.tagId IN (${q.withAllTags
          .map(() => '?')
          .join(',')})) = ${q.withAllTags.length}`
      )
      params.push(...q.withAllTags)
    }
    if (q.withoutTags) {
      where.push('NOT EXISTS (SELECT 1 FROM attachments a WHERE a.itemId = i.id)')
    }

    const orderField = q.order ?? 'createdAt'
    const orderExpr =
      orderField === 'title'
        ? 'i.title'
        : orderField === 'sourceUri'
          ? "CASE WHEN i.kind = 'file' THEN i.sourceUri ELSE '' END"
          : 'i.createdAt'
    const dir = q.orderDir === 'desc' ? 'DESC' : 'ASC'

    let sql = `SELECT i.id FROM items i`
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ` ORDER BY ${orderExpr} ${dir}, i.id ASC`
    if (q.limit !== undefined) {
      sql += ` LIMIT ?`
      params.push(q.limit)
      if (q.offset !== undefined) {
        sql += ` OFFSET ?`
        params.push(q.offset)
      }
    }

    const idRows = this.all(sql, params)
    if (idRows.length === 0) return []

    const ids = idRows.map((r) => r.id as string)
    const marks = ids.map(() => '?').join(',')
    const itemRows = this.all(`SELECT * FROM items WHERE id IN (${marks})`, ids)
    const byId = new Map<string, Row>(itemRows.map((r) => [r.id as string, r]))

    const tagRows = this.all(
      `SELECT a.itemId AS itemId, t.id AS id, t.name AS name, t.description AS description, t.createdAt AS createdAt
       FROM attachments a JOIN tags t ON t.id = a.tagId
       WHERE a.itemId IN (${marks})`,
      ids
    )
    const tagsByItem = new Map<string, Tag[]>()
    for (const r of tagRows) {
      const itemId = r.itemId as string
      const list = tagsByItem.get(itemId) ?? []
      list.push(toTag(r))
      tagsByItem.set(itemId, list)
    }

    return ids.map((id) => {
      const item = toItem(byId.get(id)!)
      const tags = (tagsByItem.get(id) ?? []).sort(byNameAsc)
      return { item, tags }
    })
  }

  // ---- 挂载 ---------------------------------------------------------------

  async attachTag(itemId: Id, tagId: Id): Promise<void> {
    this.requireItem(itemId)
    this.requireTag(tagId)
    this.run('INSERT OR IGNORE INTO attachments (itemId, tagId) VALUES (?,?)', [itemId, tagId])
  }

  async detachTag(itemId: Id, tagId: Id): Promise<void> {
    this.requireItem(itemId)
    this.requireTag(tagId)
    this.run('DELETE FROM attachments WHERE itemId = ? AND tagId = ?', [itemId, tagId])
  }

  async listAttachments(opts?: { itemId?: Id; tagId?: Id }): Promise<ItemAttach[]> {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.itemId !== undefined) {
      where.push('itemId = ?')
      params.push(opts.itemId)
    }
    if (opts?.tagId !== undefined) {
      where.push('tagId = ?')
      params.push(opts.tagId)
    }
    const sql = `SELECT itemId, tagId FROM attachments${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY rowid`
    return this.all(sql, params).map((r) => ({ itemId: r.itemId as string, tagId: r.tagId as string }))
  }

  // ---- 标签关联 -----------------------------------------------------------

  async linkTag(fromId: Id, toId: Id): Promise<void> {
    if (fromId === toId) throw invalid('标签不能自关联')
    this.requireTag(fromId)
    this.requireTag(toId)
    this.run('INSERT OR IGNORE INTO taglinks (fromId, toId) VALUES (?,?)', [fromId, toId])
  }

  async unlinkTag(fromId: Id, toId: Id): Promise<void> {
    this.requireTag(fromId)
    this.requireTag(toId)
    this.run('DELETE FROM taglinks WHERE fromId = ? AND toId = ?', [fromId, toId])
  }

  async listTagLinks(opts?: { from?: Id; to?: Id }): Promise<TagLink[]> {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.from !== undefined) {
      where.push('fromId = ?')
      params.push(opts.from)
    }
    if (opts?.to !== undefined) {
      where.push('toId = ?')
      params.push(opts.to)
    }
    const sql = `SELECT fromId, toId FROM taglinks${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY rowid`
    return this.all(sql, params).map((r) => ({ from: r.fromId as string, to: r.toId as string }))
  }

  // ---- 声明 ---------------------------------------------------------------

  async declareTag(workspaceId: Id, tagId: Id): Promise<void> {
    this.requireWorkspace(workspaceId)
    this.requireTag(tagId)
    this.run('INSERT OR IGNORE INTO declarations (workspaceId, tagId) VALUES (?,?)', [workspaceId, tagId])
  }

  async undeclareTag(workspaceId: Id, tagId: Id): Promise<void> {
    this.requireWorkspace(workspaceId)
    this.requireTag(tagId)
    this.run('DELETE FROM declarations WHERE workspaceId = ? AND tagId = ?', [workspaceId, tagId])
  }

  async listDeclarations(opts?: { workspaceId?: Id; tagId?: Id }): Promise<Declaration[]> {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.workspaceId !== undefined) {
      where.push('workspaceId = ?')
      params.push(opts.workspaceId)
    }
    if (opts?.tagId !== undefined) {
      where.push('tagId = ?')
      params.push(opts.tagId)
    }
    const sql = `SELECT workspaceId, tagId FROM declarations${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY rowid`
    return this.all(sql, params).map((r) => ({ workspaceId: r.workspaceId as string, tagId: r.tagId as string }))
  }

  // ---- 工作区 -------------------------------------------------------------

  async createWorkspace(input: NewWorkspace): Promise<Workspace> {
    if (this.idExists('workspaces', input.id)) throw conflict(`工作区 id 重复：${input.id}`)
    const ws: Workspace = { id: input.id, name: input.name, createdAt: input.createdAt }
    this.run('INSERT INTO workspaces (id, name, createdAt) VALUES (?,?,?)', [ws.id, ws.name, ws.createdAt])
    return ws
  }

  async deleteWorkspace(id: Id): Promise<void> {
    if (this.run('DELETE FROM workspaces WHERE id = ?', [id]).changes === 0) throw notFound('工作区', id)
  }

  async getWorkspace(id: Id): Promise<Workspace | null> {
    const row = this.get('SELECT * FROM workspaces WHERE id = ?', [id])
    return row ? toWorkspace(row) : null
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.all('SELECT * FROM workspaces', []).map(toWorkspace).sort(byNameAsc)
  }

  // ---- 来源根与路径节点 -----------------------------------------------------

  async addWorkspaceRoot(workspaceId: Id, path: string): Promise<void> {
    this.requireWorkspace(workspaceId)
    this.run('INSERT OR IGNORE INTO workspaceRoots (workspaceId, path) VALUES (?,?)', [workspaceId, path])
  }

  async removeWorkspaceRoot(workspaceId: Id, path: string): Promise<void> {
    this.requireWorkspace(workspaceId)
    this.run('DELETE FROM workspaceRoots WHERE workspaceId = ? AND path = ?', [workspaceId, path])
    // 删该来源根下的整棵节点树（dirPath == path 或其下）
    const prefix = `${path}/`
    this.run('DELETE FROM pathNodes WHERE workspaceId = ? AND (dirPath = ? OR substr(dirPath, 1, ?) = ?)', [
      workspaceId,
      path,
      prefix.length,
      prefix,
    ])
  }

  async listWorkspaceRoots(workspaceId: Id): Promise<WorkspaceRoot[]> {
    const rows = this.all('SELECT workspaceId, path FROM workspaceRoots WHERE workspaceId = ? ORDER BY path ASC', [
      workspaceId,
    ])
    return rows.map((r) => ({ workspaceId: r.workspaceId as string, path: r.path as string }))
  }

  async ensurePathNode(workspaceId: Id, dirPath: string, state: NodeState = 'included'): Promise<void> {
    this.requireWorkspace(workspaceId)
    this.run('INSERT OR IGNORE INTO pathNodes (workspaceId, dirPath, state) VALUES (?,?,?)', [
      workspaceId,
      dirPath,
      state,
    ])
  }

  async deletePathNode(workspaceId: Id, dirPath: string): Promise<void> {
    this.run('DELETE FROM pathNodes WHERE workspaceId = ? AND dirPath = ?', [workspaceId, dirPath])
  }

  async setPathNodeState(workspaceId: Id, dirPath: string, state: NodeState): Promise<void> {
    if (this.run('UPDATE pathNodes SET state = ? WHERE workspaceId = ? AND dirPath = ?', [state, workspaceId, dirPath]).changes === 0) {
      throw notFound('路径节点', dirPath)
    }
  }

  async listPathNodes(opts?: { workspaceId?: Id; dirPrefix?: string }): Promise<PathNode[]> {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.workspaceId !== undefined) {
      where.push('workspaceId = ?')
      params.push(opts.workspaceId)
    }
    if (opts?.dirPrefix !== undefined) {
      const prefix = `${opts.dirPrefix}/`
      where.push('dirPath = ? OR substr(dirPath, 1, ?) = ?')
      params.push(opts.dirPrefix, prefix.length, prefix)
    }
    const sql = `SELECT workspaceId, dirPath, state FROM pathNodes${
      where.length ? ` WHERE ${where.join(' AND ')}` : ''
    } ORDER BY dirPath ASC`
    return this.all(sql, params).map((r) => ({
      workspaceId: r.workspaceId as string,
      dirPath: r.dirPath as string,
      state: r.state as NodeState,
    }))
  }

  // ---- 作品 ---------------------------------------------------------------

  async createCollection(input: NewCollection): Promise<Collection> {
    this.requireItem(input.anchorItemId)
    if (this.idExists('collections', input.id)) throw conflict(`作品 id 重复：${input.id}`)
    const c: Collection = { id: input.id, name: input.name, anchorItemId: input.anchorItemId, createdAt: input.createdAt }
    this.run('INSERT INTO collections (id, name, anchorItemId, createdAt) VALUES (?,?,?,?)', [
      c.id,
      c.name,
      c.anchorItemId,
      c.createdAt,
    ])
    return c
  }

  async renameCollection(id: Id, name: string): Promise<void> {
    if (this.run('UPDATE collections SET name = ? WHERE id = ?', [name, id]).changes === 0) throw notFound('作品', id)
  }

  async deleteCollection(id: Id): Promise<void> {
    if (this.run('DELETE FROM collections WHERE id = ?', [id]).changes === 0) throw notFound('作品', id)
  }

  async getCollection(id: Id): Promise<Collection | null> {
    const row = this.get('SELECT * FROM collections WHERE id = ?', [id])
    return row ? toCollection(row) : null
  }

  async listCollections(): Promise<Collection[]> {
    return this.all('SELECT * FROM collections', []).map(toCollection).sort(byNameAsc)
  }

  async appendCollectionMember(collectionId: Id, itemId: Id): Promise<void> {
    this.requireCollection(collectionId)
    this.requireItem(itemId)
    const exists = this.get('SELECT 1 AS x FROM collectionMembers WHERE collectionId = ? AND itemId = ?', [
      collectionId,
      itemId,
    ])
    if (exists) return
    const max = this.get('SELECT COALESCE(MAX(position), -1) AS m FROM collectionMembers WHERE collectionId = ?', [
      collectionId,
    ])
    const position = Number(max?.m ?? -1) + 1
    this.run('INSERT INTO collectionMembers (collectionId, itemId, position) VALUES (?,?,?)', [
      collectionId,
      itemId,
      position,
    ])
  }

  async removeCollectionMember(collectionId: Id, itemId: Id): Promise<void> {
    this.requireCollection(collectionId)
    this.requireItem(itemId)
    this.inTx(() => {
      const removed = this.run('DELETE FROM collectionMembers WHERE collectionId = ? AND itemId = ?', [
        collectionId,
        itemId,
      ]).changes
      if (removed === 0) return
      // 压实位置
      const rows = this.all(
        'SELECT itemId, position FROM collectionMembers WHERE collectionId = ? ORDER BY position ASC',
        [collectionId]
      )
      rows.forEach((row, i) => {
        if (Number(row.position) !== i) {
          this.run('UPDATE collectionMembers SET position = ? WHERE collectionId = ? AND itemId = ?', [
            i,
            collectionId,
            row.itemId,
          ])
        }
      })
    })
  }

  async reorderCollectionMembers(collectionId: Id, orderedItemIds: Id[]): Promise<void> {
    this.requireCollection(collectionId)
    const current = this.all(
      'SELECT itemId FROM collectionMembers WHERE collectionId = ? ORDER BY position ASC',
      [collectionId]
    ).map((r) => r.itemId as string)
    const sameSet =
      current.length === orderedItemIds.length &&
      new Set(orderedItemIds).size === orderedItemIds.length &&
      [...current].sort().join('\u0000') === [...orderedItemIds].sort().join('\u0000')
    if (!sameSet) throw invalid('重排必须恰好是当前成员集合的一个排列')
    this.inTx(() => {
      orderedItemIds.forEach((itemId, i) => {
        this.run('UPDATE collectionMembers SET position = ? WHERE collectionId = ? AND itemId = ?', [
          i,
          collectionId,
          itemId,
        ])
      })
    })
  }

  async listCollectionMemberships(opts?: { collectionId?: Id; itemId?: Id }): Promise<CollectionMember[]> {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.collectionId !== undefined) {
      where.push('collectionId = ?')
      params.push(opts.collectionId)
    }
    if (opts?.itemId !== undefined) {
      where.push('itemId = ?')
      params.push(opts.itemId)
    }
    const sql = `SELECT collectionId, itemId, position FROM collectionMembers${
      where.length ? ` WHERE ${where.join(' AND ')}` : ''
    } ORDER BY position ASC`
    return this.all(sql, params).map((r) => ({
      collectionId: r.collectionId as string,
      itemId: r.itemId as string,
      position: Number(r.position),
    }))
  }

  // ---- 组 ---------------------------------------------------------------

  async createGroup(input: NewGroup): Promise<Group> {
    if (this.idExists('groups', input.id)) throw conflict(`组 id 重复：${input.id}`)
    const g: Group = { id: input.id, name: input.name, createdAt: input.createdAt }
    this.run('INSERT INTO groups (id, name, createdAt) VALUES (?,?,?)', [g.id, g.name, g.createdAt])
    return g
  }

  async renameGroup(id: Id, name: string): Promise<void> {
    if (this.run('UPDATE groups SET name = ? WHERE id = ?', [name, id]).changes === 0) throw notFound('组', id)
  }

  async deleteGroup(id: Id): Promise<void> {
    if (this.run('DELETE FROM groups WHERE id = ?', [id]).changes === 0) throw notFound('组', id)
  }

  async getGroup(id: Id): Promise<Group | null> {
    const row = this.get('SELECT * FROM groups WHERE id = ?', [id])
    return row ? toGroup(row) : null
  }

  async listGroups(): Promise<Group[]> {
    return this.all('SELECT * FROM groups', []).map(toGroup).sort(byNameAsc)
  }

  async addGroupMember(groupId: Id, tagId: Id): Promise<void> {
    this.requireGroup(groupId)
    this.requireTag(tagId)
    this.run('INSERT OR IGNORE INTO groupMembers (groupId, tagId) VALUES (?,?)', [groupId, tagId])
  }

  async removeGroupMember(groupId: Id, tagId: Id): Promise<void> {
    this.requireGroup(groupId)
    this.requireTag(tagId)
    this.run('DELETE FROM groupMembers WHERE groupId = ? AND tagId = ?', [groupId, tagId])
  }

  async listGroupMemberships(opts?: { groupId?: Id; tagId?: Id }): Promise<GroupMember[]> {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.groupId !== undefined) {
      where.push('groupId = ?')
      params.push(opts.groupId)
    }
    if (opts?.tagId !== undefined) {
      where.push('tagId = ?')
      params.push(opts.tagId)
    }
    const sql = `SELECT groupId, tagId FROM groupMembers${
      where.length ? ` WHERE ${where.join(' AND ')}` : ''
    } ORDER BY rowid`
    return this.all(sql, params).map((r) => ({ groupId: r.groupId as string, tagId: r.tagId as string }))
  }

  // ---- 内部辅助 -----------------------------------------------------------

  private run(sql: string, params: unknown[]) {
    return this.db.prepare(sql).run(...params)
  }

  private get(sql: string, params: unknown[]): Row | null {
    const row = this.db.prepare(sql).get(...params)
    return row ? (row as Row) : null
  }

  private all(sql: string, params: unknown[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[]
  }

  private idExists(table: string, id: Id): boolean {
    return this.get(`SELECT 1 AS x FROM ${table} WHERE id = ?`, [id]) !== null
  }

  private tagNameExists(name: string): boolean {
    return this.get('SELECT 1 AS x FROM tags WHERE LOWER(TRIM(name)) = LOWER(?)', [name]) !== null
  }

  private requireTag(id: Id): void {
    if (!this.idExists('tags', id)) throw notFound('标签', id)
  }

  private requireItem(id: Id): void {
    if (!this.idExists('items', id)) throw notFound('条目', id)
  }

  private requireWorkspace(id: Id): void {
    if (!this.idExists('workspaces', id)) throw notFound('工作区', id)
  }

  private requireCollection(id: Id): void {
    if (!this.idExists('collections', id)) throw notFound('作品', id)
  }

  private requireGroup(id: Id): void {
    if (!this.idExists('groups', id)) throw notFound('组', id)
  }
}

/** 以注入驱动建 Store（node:sqlite 或 better-sqlite3，由调用方决定）。 */
export function createSqliteStoreFromDriver(db: SyncSqlite): Store {
  return new SqliteStore(db)
}
