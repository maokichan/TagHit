/**
 * 真实文件操作用例（文件增删改功能组件的后端）。
 *
 * 边界纪律：一切路径必须位于指定工作区的来源根之下（路径段匹配，与字节闸门 D15 同规则）
 * ——这是文件写入的唯一闸门。**应用内操作直改库**（条目/节点行在同一事务内按同一条
 * 重定基规则改写，保 id 保标签），不靠重扫认领——只有**应用外**的改动才由扫描收敛。
 * 删除走 Trash 端口（真实实现进系统回收站），不经 fs 端口——不可恢复删除不进本用例面。
 */

import { DomainError } from '../domain/index.ts'
import type { Id } from '../domain/index.ts'
import type { FileSystem, Trash } from '../ports/index.ts'
import type { AppServices } from './services.ts'
import { deleteItemIn } from './cascade.ts'
import {
  assertUnderRoot,
  basename,
  isUnderDir,
  isUnderRoot,
  joinPath,
  normalizePath,
  parentDir,
  rebasePath
} from './paths.ts'

/**
 * 改名/移动文件或目录（磁盘操作）。newName 缺省保持原名（纯移动）。
 * from 不存在 → NOT_FOUND；目标已存在 → CONFLICT；目录移入自身、源为来源根本身 → INVALID。
 * 返回落位后的绝对路径（供调用方提示）。
 */
export async function moveFsEntry(
  svc: AppServices,
  fs: FileSystem,
  workspaceId: Id,
  fromPath: string,
  toDir: string,
  newName?: string | null
): Promise<{ to: string }> {
  const from = await assertUnderRoot(svc, workspaceId, fromPath)
  const to = await assertUnderRoot(
    svc,
    workspaceId,
    joinPath(normalizePath(toDir), newName != null && newName !== '' ? newName : basename(from))
  )
  if (from === to) {
    throw new DomainError('INVALID', '源与目标是同一路径')
  }
  const roots = await svc.store.listWorkspaceRoots(workspaceId)
  if (roots.some((r) => r.path === from)) {
    throw new DomainError('INVALID', '来源根目录本身不支持移动（请卸载后重新挂载）')
  }
  const st = await fs.stat(from)
  if (!st.exists) {
    throw new DomainError('NOT_FOUND', `源路径不存在（${from}）`)
  }
  if ((await fs.stat(to)).exists) {
    throw new DomainError('CONFLICT', `目标已存在（${to}）`)
  }
  if (st.kind === 'dir' && isUnderDir(from, to)) {
    throw new DomainError('INVALID', '目录不能移入自身子树')
  }
  await fs.rename(from, to)
  // 条目与节点行按同一条重定基规则直改（单事务）。节点行随之搬动并保留状态
  // （excluded 是用户意图）；目的地祖先节点链补齐——可见性 = 直接父节点存在且 included
  // （查询时派生），新目录没有节点行会让条目当场脱视图。ensurePathNode 不覆盖既有状态（D27）。
  await svc.store.transaction(async (db) => {
    for (const node of await db.listPathNodes({ workspaceId, dirPrefix: from })) {
      await db.ensurePathNode(workspaceId, rebasePath(node.dirPath, from, to), node.state)
      await db.deletePathNode(workspaceId, node.dirPath)
    }
    const rootPaths = roots.map((r) => r.path)
    for (let dir = parentDir(to); dir !== '' && isUnderRoot(rootPaths, dir); dir = parentDir(dir)) {
      await db.ensurePathNode(workspaceId, dir)
    }
    for (const hit of await db.queryItems({ underAnyDir: [from] })) {
      if (hit.item.kind !== 'file') continue // underAnyDir 只命中 file 条目
      const patch: { sourceUri: string; title?: string } = {
        sourceUri: rebasePath(hit.item.sourceUri, from, to)
      }
      if (hit.item.sourceUri === from) patch.title = basename(to) // title 口径 = 文件名（扫描同款），改名随行
      await db.updateItem(hit.item.id, patch)
    }
  })
  return { to }
}

/** 移除文件/目录（进系统回收站）。路径不存在 → NOT_FOUND；来源根本身 → INVALID。 */
export async function trashFsEntry(
  svc: AppServices,
  fs: FileSystem,
  trash: Trash,
  workspaceId: Id,
  path: string
): Promise<void> {
  const p = await assertUnderRoot(svc, workspaceId, path)
  const roots = await svc.store.listWorkspaceRoots(workspaceId)
  if (roots.some((r) => r.path === p)) {
    throw new DomainError('INVALID', '来源根目录本身不支持删除（请卸载来源根）')
  }
  if (!(await fs.stat(p)).exists) {
    throw new DomainError('NOT_FOUND', `路径不存在（${p}）`)
  }
  await trash.trash(p)
  // **删除即删除**（用户裁决）：应用内删除 = 条目记录级联清除（标签/作品成员随行），
  // 不是标缺失——标签是可再生信息，文件本身在系统回收站可寻回；反悔后重扫按新条目收录。
  // 节点行不动：目录的清理与 excluded 意图照旧由扫描的消失判定（D27）处理。
  await svc.store.transaction(async (db) => {
    for (const hit of await db.queryItems({ underAnyDir: [p] })) {
      await deleteItemIn(db, hit.item.id)
    }
  })
}
