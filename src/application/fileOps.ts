/**
 * 真实文件操作用例（文件增删改功能组件的后端；改的是磁盘，不是库）。
 *
 * 边界纪律：一切路径必须位于指定工作区的来源根之下（路径段匹配，与字节闸门 D15 同规则）
 * ——这是文件写入的唯一闸门。操作只动文件系统，**不直接改库**：条目/标签的随动
 * 由调用方紧接着重扫收敛（scan 的 contentHash 认领保证移动后条目 id 与标签原样保留）。
 * 删除走 Trash 端口（真实实现进系统回收站），不经 fs 端口——不可恢复删除不进本用例面。
 */

import { DomainError } from '../domain/index.ts'
import type { Id } from '../domain/index.ts'
import type { FileSystem, Trash } from '../ports/index.ts'
import type { AppServices } from './services.ts'
import { assertUnderRoot, basename, isUnderDir, joinPath, normalizePath } from './paths.ts'

/**
 * 改名/移动文件或目录（磁盘操作）。newName 缺省保持原名（纯移动）。
 * from 不存在 → NOT_FOUND；目标已存在 → CONFLICT；目录移入自身 → INVALID。
 * 返回落位后的绝对路径（供调用方提示/重扫定位）。
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
  return { to }
}

/** 移除文件/目录（进系统回收站）。路径不存在 → NOT_FOUND。 */
export async function trashFsEntry(
  svc: AppServices,
  fs: FileSystem,
  trash: Trash,
  workspaceId: Id,
  path: string
): Promise<void> {
  const p = await assertUnderRoot(svc, workspaceId, path)
  if (!(await fs.stat(p)).exists) {
    throw new DomainError('NOT_FOUND', `路径不存在（${p}）`)
  }
  await trash.trash(p)
}
