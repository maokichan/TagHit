/**
 * 收录扫描（应用层用例，两阶段：路径遍历 + 条目级）。
 *
 * 触发：手动、对单个工作区、整树、幂等 diff（重扫可任意重复）。
 * 产物：
 * - 路径节点：按工作区 × 目录路径确保存在（缺省 included，不改动既有 excluded）；
 *   已消失目录（本次未访问）的节点行删除。
 * - 条目：file 条目按 sourceUri 全局唯一 upsert——存在则更新文件事实
 *   （哈希/大小/修改时间；缺失后再现恢复 active），缺则创建（title = 文件名）；
 *   新路径若与某 missing 条目同 contentHash（且其旧路径确已消失）→ **认领**：
 *   原条目改写路径并恢复 active（标签/作品成员随条目 id 原样保留，即"移动语义"）。
 * - 消失策略（可配置，默认 keep）：文件/目录在磁盘消失 →
 *   keep = 条目标记 missing 保留（标签是用户资产）；discard = 删除条目及全部关联。
 *
 * 容错（D24）：目录不可读 → 产出错误条目并跳过其子树；文件级 IO（stat/hash/readHead）失败
 * → 跳过该文件并计入摘要。两者一律**不参与消失判定**——读不到 ≠ 已消失。
 * 消失判定另有两条纪律：用户排除的目录节点行**保留**（排除意图是用户资产，D27）；
 * 目录重现时其排除状态因此仍在。
 *
 * 浏览可见性派生所需节点状态即由本用例维护；挂载/卸载来源根也在此（薄封装）。
 */

import type { FileItem, Id, NodeState } from '../domain/index.ts'
import type { FileSystem, FsStat, Store } from '../ports/index.ts'
import type { AppServices } from './services.ts'
import { basename, isUnderDir } from './paths.ts'
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
  /** 新路径认领既有 missing 条目（同 contentHash 移动语义）；不计入 created。 */
  itemsRelocated: number
  itemsUpdated: number
  itemsMissing: number
  itemsDiscarded: number
  /**
   * 本次不可读的目录数（权限/IO/根不存在）：其子树被跳过。
   * 这些子树**不参与消失判定**（节点行保留、条目不改状态），故摘要里的 missing/removed 不含它们。
   */
  dirsUnreadable: number
  /**
   * 本次不可读的文件数（遍历见到、但 stat/hash/readHead 失败的单个文件）。
   * 读不到 ≠ 已消失：这些文件既不建/更新条目，也不参与消失判定；下次扫描再说。
   */
  filesUnreadable: number
}

/** 单文件事实采集结果：正常 / 采集期间已消失 / 读不到（IO 失败）。 */
type FileFacts =
  | { kind: 'ok'; hash: string; size: number | null; modifiedAt: string | null; width: number | null; height: number | null }
  | { kind: 'gone' }
  | { kind: 'unreadable'; message: string }

/**
 * 采集单文件事实（stat + 内容签名 + 图片固有尺寸）。
 * 单点失败只影响该文件：消失 → gone（交给消失判定按策略处理）；IO 失败 → unreadable。
 */
async function readFileFacts(fs: FileSystem, path: string): Promise<FileFacts> {
  try {
    const stat: FsStat = await fs.stat(path)
    if (!stat.exists) return { kind: 'gone' }
    const hash = await fs.hash(path)
    // 图片：读文件头解析固有尺寸（老版 image-size 的零依赖替代；失败 → null 缺省）
    const dims = isImageFile(basename(path)) ? parseImageSize(await fs.readHead(path, 65536)) : null
    return {
      kind: 'ok',
      hash,
      size: stat.size ?? null,
      modifiedAt: stat.modifiedAt ?? null,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    }
  } catch (error) {
    return { kind: 'unreadable', message: error instanceof Error ? error.message : String(error) }
  }
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
    itemsRelocated: 0,
    itemsUpdated: 0,
    itemsMissing: 0,
    itemsDiscarded: 0,
    dirsUnreadable: 0,
    filesUnreadable: 0,
  }

  const roots = (await svc.store.listWorkspaceRoots(workspaceId)).map((r) => r.path)
  summary.scannedRoots = roots.length
  if (roots.length === 0) return summary

  // 扫描前快照：既有节点集（含状态：消失判定要跳过用户排除的行） + 各来源根下的既有 file 条目
  const nodesBefore = new Map<string, NodeState>(
    (await svc.store.listPathNodes({ workspaceId })).map((n) => [n.dirPath, n.state])
  )
  const itemByUri = new Map<string, FileItem>()
  for (const root of roots) {
    for (const hit of await svc.store.queryItems({ underDirPath: root })) {
      if (hit.item.kind === 'file') itemByUri.set(hit.item.sourceUri, hit.item)
    }
  }
  // 认领候选：快照中 missing 且有内容签名的条目按 contentHash 索引（同哈希取其一；认领后出列）
  const missingByHash = new Map<string, FileItem>()
  for (const item of itemByUri.values()) {
    if (item.status === 'missing' && item.contentHash != null && !missingByHash.has(item.contentHash)) {
      missingByHash.set(item.contentHash, item)
    }
  }
  const claimedIds = new Set<string>()

  const visitedDirs = new Set<string>()
  /** 本次不可读的目录：其子树不参与消失判定（无法区分"消失"与"读不到"）。 */
  const unreadableDirs: string[] = []
  /** 本次不可读的文件：同样不参与消失判定（D24 的文件级同规则）。 */
  const unreadableFiles: string[] = []
  const underUnreadable = (path: string): boolean =>
    unreadableDirs.some((dir) => isUnderDir(dir, path))
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
        else if (entry.kind === 'error') {
          // 不可读子树：跳过并在摘要里报数（不影响其余部分，也不参与消失判定）
          unreadableDirs.push(entry.path)
          summary.dirsUnreadable++
          console.warn(`[scan] 目录不可读，已跳过其子树：${entry.path}（${entry.message ?? '未知原因'}）`)
        } else files.push(entry.path)
      }

      // 阶段一：路径遍历 → 确保目录节点（不覆盖既有状态）
      for (const dir of dirs) {
        await ensureDir(db, dir)
        visitedDirs.add(dir)
      }

      // 阶段二：条目级 → 按 sourceUri 全局 upsert file 条目
      for (const path of files) {
        const facts = await readFileFacts(fs, path)
        if (facts.kind === 'gone') continue // 遍历与采集之间消失：交给下面的消失判定按策略处理
        if (facts.kind === 'unreadable') {
          // 单点故障不得让整次扫描失败（D24 同规则，此前只覆盖目录级）
          unreadableFiles.push(path)
          summary.filesUnreadable++
          console.warn(`[scan] 文件不可读，本次跳过：${path}（${facts.message}）`)
          continue
        }
        const { hash, size, modifiedAt, width, height } = facts
        const existing = itemByUri.get(path)
        if (!existing) {
          // 认领：新路径与某 missing 条目同内容、且其旧路径确已不在 → 移动语义（id 不变，标签随行）
          const claimable = missingByHash.get(hash)
          if (claimable != null && !claimedIds.has(claimable.id) && !(await fs.stat(claimable.sourceUri)).exists) {
            missingByHash.delete(hash)
            claimedIds.add(claimable.id)
            await db.updateItem(claimable.id, {
              title: basename(path),
              sourceUri: path,
              status: 'active',
              contentHash: hash,
              size,
              fileModifiedAt: modifiedAt,
              width,
              height,
            })
            summary.itemsRelocated++
          } else {
            const item: FileItem = {
              kind: 'file',
              id: svc.idGen.newId(),
              title: basename(path),
              sourceUri: path,
              contentHash: hash,
              size,
              fileModifiedAt: modifiedAt,
              status: 'active',
              createdAt: now,
              width,
              height,
            }
            await db.createItem(item)
            summary.itemsCreated++
          }
        } else {
          const changed =
            existing.status !== 'active' ||
            existing.contentHash !== hash ||
            existing.size !== size ||
            existing.fileModifiedAt !== modifiedAt ||
            (existing.width ?? null) !== width ||
            (existing.height ?? null) !== height
          if (changed) {
            await db.updateItem(existing.id, {
              status: 'active',
              contentHash: hash,
              size,
              fileModifiedAt: modifiedAt,
              width,
              height,
            })
            summary.itemsUpdated++
          }
        }
      }
    }

    // 消失目录 → 删节点行（仅限本次各来源根下、未再访问、且**不在不可读子树内**的节点）。
    // 用户排除过的节点行保留（D27）：排除意图是用户资产，目录重现时排除仍然生效——
    // 否则一次移动/卸载就会把用户逐个排掉的目录全部"还原"。
    for (const [dir, state] of nodesBefore) {
      const underRoot = roots.some((root) => isUnderDir(root, dir))
      if (!underRoot || visitedDirs.has(dir) || underUnreadable(dir)) continue
      if (state === 'excluded') continue // 保留：只清扫描派生的 included 行
      await db.deletePathNode(workspaceId, dir)
      summary.nodesRemoved++
    }

    // 消失文件 → 按策略处理（本次已被认领的条目跳过：其路径已改写为新位置；
    // 不可读子树/文件内的条目不判定——读不到 ≠ 已消失，宁可留着让下次扫描再说）
    for (const [uri, item] of itemByUri) {
      if (claimedIds.has(item.id)) continue
      if (underUnreadable(uri) || unreadableFiles.includes(uri)) continue
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
