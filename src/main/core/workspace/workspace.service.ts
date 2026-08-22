import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join, normalize } from 'path'
import type { AppDb } from '../../db/connection'
import type { ConfigService } from '../config'
import type { EmitFn } from '../../events'
import { workspaceDao } from './workspace.dao'
import { itemDao } from '../item/item.dao'
import { scanWorkspace } from './scan'
import { isUnderPath } from '../path-util'
import type {
  AddPathRequest,
  ScanRequest,
  ScanResult,
  Workspace,
  WorkspacePath,
  WorkspaceWithPaths
} from '@shared/types/workspace'

/**
 * WorkspaceService —— 工作区域业务规则唯一归属（P0.5 收拢）。
 * 收拢来源：workspace.dao.ts（封面策略 resolveCoverUri / 脱离决策 detachItemsUnderPath）、
 *           scan.ts 收尾语义（finalizeScanStatus 的 existsSync/isUnderPath 判定）、
 *           ipc/workspace.ts（移除路径的脱离语义、封面白名单复制）。
 */
export class WorkspaceService {
  constructor(
    private readonly db: AppDb,
    private readonly config: ConfigService,
    private readonly emit: EmitFn
  ) {}

  /** 工作区图片扩展名（封面自动选取用） */
  private imageExts(): string[] {
    return Object.entries(this.config.get().fileFormatMap)
      .filter(([, v]) => v === 'image')
      .map(([k]) => k)
  }

  /**
   * 封面展示地址（策略）：用户指定 coverPath 优先，否则取工作区内第一张图（缩略图 → 原图）。
   * 来源：原 workspace.dao.resolveCoverUri（P0.5 移入 service）。
   */
  private resolveCoverUri(ws: Workspace): string | null {
    if (ws.coverPath) return ws.coverPath
    const exts = this.imageExts()
    if (exts.length === 0) return null
    const placeholders = exts.map(() => '?').join(',')
    const thumb = this.db.read
      .prepare(
        `SELECT i.preview_uri AS uri FROM item i
         JOIN workspace_item wi ON wi.item_id = i.id
         WHERE wi.workspace_id = ? AND i.preview_uri IS NOT NULL AND i.extension IN (${placeholders})
         ORDER BY i.updated_at DESC LIMIT 1`
      )
      .get(ws.id, ...exts) as { uri: string } | undefined
    if (thumb) return thumb.uri
    const src = this.db.read
      .prepare(
        `SELECT i.source_uri AS uri FROM item i
         JOIN workspace_item wi ON wi.item_id = i.id
         WHERE wi.workspace_id = ? AND i.source_uri IS NOT NULL AND i.extension IN (${placeholders})
         ORDER BY i.updated_at DESC LIMIT 1`
      )
      .get(ws.id, ...exts) as { uri: string } | undefined
    return src?.uri ?? null
  }

  private withPaths(id: number): WorkspaceWithPaths {
    const ws = workspaceDao.getById(this.db, id)
    if (!ws) throw new Error('工作区不存在')
    return {
      ...ws,
      paths: workspaceDao.listPaths(this.db, id),
      coverUri: this.resolveCoverUri(ws)
    }
  }

  list(): WorkspaceWithPaths[] {
    const workspaces = workspaceDao.list(this.db)
    const paths = workspaceDao.listAllPaths(this.db)
    const pathsByWs = new Map<number, WorkspacePath[]>()
    for (const p of paths) {
      const list = pathsByWs.get(p.workspaceId) ?? []
      list.push(p)
      pathsByWs.set(p.workspaceId, list)
    }
    return workspaces.map((ws) => ({
      ...ws,
      paths: pathsByWs.get(ws.id) ?? [],
      coverUri: this.resolveCoverUri(ws)
    }))
  }

  create(title: string): WorkspaceWithPaths {
    const ws = workspaceDao.create(this.db, title.trim() || '未命名工作区')
    this.emit('workspace:created', ws)
    return { ...ws, paths: [], coverUri: null }
  }

  update(id: number, title: string): WorkspaceWithPaths {
    workspaceDao.update(this.db, id, title.trim() || '未命名工作区')
    return this.withPaths(id)
  }

  remove(id: number): void {
    workspaceDao.delete(this.db, id)
    this.emit('workspace:deleted', { id })
  }

  addPath(req: AddPathRequest): WorkspaceWithPaths {
    if (!req.path.trim()) throw new Error('路径不能为空')
    const path = workspaceDao.addPath(this.db, req.workspaceId, req.path.trim(), req.recursive ?? true)
    this.emit('workspace:pathAdded', { workspaceId: req.workspaceId, path: path.path })
    return this.withPaths(req.workspaceId)
  }

  /**
   * 移除扫描路径（语义）：该路径下条目从工作区脱离（保留全局条目/标签/元数据，不再标缺失，
   * 可重加路径恢复）。来源：原 ipc/workspace.ts 内联逻辑 + workspace.dao.detachItemsUnderPath。
   */
  removePath(pathId: number, workspaceId: number): WorkspaceWithPaths {
    const row = workspaceDao.getPathById(this.db, pathId, workspaceId)
    if (row) {
      workspaceDao.removePath(this.db, pathId)
      const targets = itemDao
        .listWorkspaceItemUris(this.db, workspaceId)
        .filter((r) => r.sourceUri && isUnderPath(r.sourceUri, row.path))
        .map((r) => r.id)
      if (targets.length > 0) {
        itemDao.detachItems(this.db, workspaceId, targets)
      }
      this.emit('workspace:pathRemoved', { workspaceId, path: row.path })
    }
    return this.withPaths(workspaceId)
  }

  /**
   * 设置封面（null = 自动取工作区内图片）。白名单外图片（如外部目录）复制进 userData/covers 再引用。
   * 来源：原 ipc/workspace.ts setCover handler（P0.5 移入）。
   */
  setCover(id: number, coverPath: string | null): WorkspaceWithPaths {
    let cover = coverPath
    if (cover) {
      const allowed = [
        ...(this.db.read.prepare('SELECT DISTINCT path FROM workspace_path').all() as { path: string }[]),
        { path: app.getPath('userData') }
      ].map((r) => normalize(r.path))
      const inWhitelist = allowed.some((root) =>
        normalize(cover as string).toLowerCase().startsWith(root.toLowerCase())
      )
      if (!inWhitelist) {
        const dot = cover.lastIndexOf('.')
        const ext = dot >= 0 ? cover.slice(dot) : '.jpg'
        const dir = join(app.getPath('userData'), 'covers')
        mkdirSync(dir, { recursive: true })
        const target = join(dir, `ws-${id}${ext}`)
        copyFileSync(cover, target)
        cover = target
      }
    }
    workspaceDao.setCover(this.db, id, cover)
    return this.withPaths(id)
  }

  /** 扫描入口：进度/完成走领域事件（P0.5 事件源就位，P1 插件订阅同一事件源） */
  async scan(req: ScanRequest): Promise<ScanResult> {
    const result = await scanWorkspace(this.db, this.config.get(), req.workspaceId, {
      incremental: req.incremental,
      onProgress: (p) => this.emit('scan:progress', p),
      onFinalize: (seenUris, currentPaths) => this.finalizeScan(req.workspaceId, seenUris, currentPaths)
    })
    this.emit('scan:completed', result)
    return result
  }

  /**
   * 扫描收尾缺失语义（P0.5 收拢，来源：item.dao.finalizeScanStatus）：
   * - 已不在任何配置路径下（路径被移除/收窄）→ 脱离（保留全局条目/标签/元数据）
   * - 仍在配置路径内但文件未出现：所在目录还存在 → 标 missing；目录也没了 → 脱离
   * 目录存在性按父目录批量缓存判存，避免逐文件 stat。
   */
  finalizeScan(
    workspaceId: number,
    seenUris: Set<string>,
    currentPaths: string[]
  ): { markedMissing: number; detached: number } {
    const rows = itemDao.listWorkspaceItemUris(this.db, workspaceId)
    const toMissing: number[] = []
    const toDetach: number[] = []
    const dirExistsCache = new Map<string, boolean>()

    for (const r of rows) {
      if (r.sourceUri && seenUris.has(r.sourceUri)) continue // 本次已见，upsert 已置 active
      if (!r.sourceUri) {
        toDetach.push(r.id)
        continue
      }
      const underPath = currentPaths.some((p) => isUnderPath(r.sourceUri as string, p))
      if (!underPath) {
        toDetach.push(r.id) // 已不在任何配置路径 → 脱离（含历史遗留的 missing 条目）
        continue
      }
      // 在路径内但本次未见：目录还在 → 缺失（已是 missing 则保持）；目录也没了 → 脱离
      const dir = dirname(r.sourceUri)
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

    const markedMissing = itemDao.markMissing(this.db, workspaceId, toMissing)
    const detached = itemDao.detachItems(this.db, workspaceId, toDetach)
    return { markedMissing, detached }
  }
}
