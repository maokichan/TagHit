/**
 * 收录扫描（应用层用例，两阶段：路径遍历 + 条目级）。
 *
 * 触发：手动、对单个工作区、整树、幂等 diff（重扫可任意重复）。
 * 产物：
 * - 路径节点：按工作区 × 目录路径确保存在（缺省 included，不改动既有 excluded）；
 *   已消失目录（本次未访问）的节点行删除。
 * - 条目：file 条目按 sourceUri 全局唯一 upsert——存在则更新文件事实
 *   （哈希/大小/修改时间；缺失后再现恢复 active），缺则创建（title = 文件名）。
 * - 消失策略（可配置，默认 keep）：文件/目录在磁盘消失 →
 *   keep = 条目标记 missing 保留（标签是用户资产）；discard = 删除条目及全部关联。
 *
 * 浏览可见性派生所需节点状态即由本用例维护；挂载/卸载来源根也在此（薄封装）。
 */

import type { FileItem, Id } from '../domain/index.ts'
import type { FileSystem, Store } from '../ports/index.ts'
import type { AppServices } from './services.ts'
import { basename } from './paths.ts'
import { isImageFile, parseImageSize } from './mediaMeta.ts'
import { deleteItemIn } from './cascade.ts'

export type MissingPolicy = 'keep' | 'discard'

export interface ScanOptions {
  /** 文件/目录消失时的处理；缺省 keep（标记 missing）。 */
  missing?: MissingPolicy
}

export interface ScanSummary {
  scannedRoots: number
  nodesCreated: number
  nodesRemoved: number
  itemsCreated: number
  itemsUpdated: number
  itemsMissing: number
  itemsDiscarded: number
}

export async function mountWorkspaceRoot(
  svc: AppServices,
  workspaceId: Id,
  path: string
): Promise<void> {
  await svc.store.addWorkspaceRoot(workspaceId, path)
}

export async function unmountWorkspaceRoot(
  svc: AppServices,
  workspaceId: Id,
  path: string
): Promise<void> {
  await svc.store.removeWorkspaceRoot(workspaceId, path)
}

export async function scanWorkspace(
  svc: AppServices,
  fs: FileSystem,
  workspaceId: Id,
  options: ScanOptions = {}
): Promise<ScanSummary> {
  const policy = options.missing ?? 'keep'
  const summary: ScanSummary = {
    scannedRoots: 0,
    nodesCreated: 0,
    nodesRemoved: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsMissing: 0,
    itemsDiscarded: 0,
  }

  const roots = (await svc.store.listWorkspaceRoots(workspaceId)).map((r) => r.path)
  summary.scannedRoots = roots.length
  if (roots.length === 0) return summary

  // 扫描前快照：既有节点集 + 各来源根下的既有 file 条目（uri → 条目）
  const nodesBefore = new Set(
    (await svc.store.listPathNodes({ workspaceId })).map((n) => n.dirPath)
  )
  const itemByUri = new Map<string, FileItem>()
  for (const root of roots) {
    for (const hit of await svc.store.queryItems({ sourceUriPrefix: root })) {
      if (hit.item.kind === 'file') itemByUri.set(hit.item.sourceUri, hit.item)
    }
  }

  const visitedDirs = new Set<string>()
  const now = svc.clock.now()

  const ensureDir = async (db: Store, dir: string): Promise<void> => {
    if (!nodesBefore.has(dir)) summary.nodesCreated++
    await db.ensurePathNode(workspaceId, dir)
  }

  await svc.store.transaction(async (db) => {
    for (const root of roots) {
      await ensureDir(db, root)
      visitedDirs.add(root)

      const dirs: string[] = []
      const files: string[] = []
      for await (const entry of fs.walk(root)) {
        if (entry.kind === 'dir') dirs.push(entry.path)
        else files.push(entry.path)
      }

      // 阶段一：路径遍历 → 确保目录节点（不覆盖既有状态）
      for (const dir of dirs) {
        await ensureDir(db, dir)
        visitedDirs.add(dir)
      }

      // 阶段二：条目级 → 按 sourceUri 全局 upsert file 条目
      for (const path of files) {
        const stat = await fs.stat(path)
        const hash = await fs.hash(path)
        // 图片：读文件头解析固有尺寸（老版 image-size 的零依赖替代；失败 → null 缺省）
        const dims = isImageFile(basename(path)) ? parseImageSize(await fs.readHead(path, 65536)) : null
        const width = dims?.width ?? null
        const height = dims?.height ?? null
        const existing = itemByUri.get(path)
        if (!existing) {
          const item: FileItem = {
            kind: 'file',
            id: svc.idGen.newId(),
            title: basename(path),
            sourceUri: path,
            contentHash: hash,
            size: stat.size ?? null,
            fileModifiedAt: stat.modifiedAt ?? null,
            status: 'active',
            createdAt: now,
            width,
            height,
          }
          await db.createItem(item)
          summary.itemsCreated++
        } else {
          const changed =
            existing.status !== 'active' ||
            existing.contentHash !== hash ||
            existing.size !== (stat.size ?? null) ||
            existing.fileModifiedAt !== (stat.modifiedAt ?? null) ||
            (existing.width ?? null) !== width ||
            (existing.height ?? null) !== height
          if (changed) {
            await db.updateItem(existing.id, {
              status: 'active',
              contentHash: hash,
              size: stat.size ?? null,
              fileModifiedAt: stat.modifiedAt ?? null,
              width,
              height,
            })
            summary.itemsUpdated++
          }
        }
      }
    }

    // 消失目录 → 删节点行（仅限本次各来源根下、未再访问的节点）
    for (const dir of nodesBefore) {
      const underRoot = roots.some((root) => dir === root || dir.startsWith(`${root}/`))
      if (underRoot && !visitedDirs.has(dir)) {
        await db.deletePathNode(workspaceId, dir)
        summary.nodesRemoved++
      }
    }

    // 消失文件 → 按策略处理
    for (const [uri, item] of itemByUri) {
      if ((await fs.stat(uri)).exists) continue
      if (policy === 'keep') {
        if (item.status !== 'missing') {
          await db.updateItem(item.id, { status: 'missing' })
          summary.itemsMissing++
        }
      } else {
        summary.itemsDiscarded++
        await deleteItemIn(db, item.id)
      }
    }
  })

  return summary
}
