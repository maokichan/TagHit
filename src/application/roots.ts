/**
 * 来源根生命周期与脱根条目（应用层用例）。
 *
 * 三个概念在这里对齐（术语见 GLOSSARY）：
 * - **来源根**：工作区配置行（挂载/卸载在此）；
 * - **退役根**：来源根的卸载记录（卸载时落一行）——条目按裁决不随卸载消失
 *   （条目全局，不由工作区拥有），但它们由此脱离全部来源根、不进任何工作区视图，
 *   退役记录就是这些条目的**可寻址凭据**；
 * - **脱根条目**：有来源、但没有任何来源根覆盖的条目。它由两部分构成：
 *   ① 退役根之下的（有记录，报告精确路径与时间）；② 无记录的历史残留
 *   （卸载记录机制落地前卸载的根，如旧版遗留）——按父目录聚合报告。
 *
 * 可见性派生由存储条件翻译执行（D19：`directNodeStateIn` / `underDirPath` / `notUnderAnyDir`），
 * 本层只组装条件与编排事务，不做路径判定（路径规则在 domain/paths.ts）。
 */

import type { Id } from '../domain/index.ts'
import { DomainError, parentDir } from '../domain/index.ts'
import { isUnderDir, normalizePath } from '../domain/paths.ts'
import type { AppServices } from './services.ts'
import { deleteItemIn } from './cascade.ts'

/** 挂来源根。同名退役记录一并清除（挂载 = 恢复该根条目的归属）。 */
export async function mountWorkspaceRoot(
  svc: AppServices,
  workspaceId: Id,
  path: string
): Promise<void> {
  // 归一化在边界执行：用户输入/原生选择器可能带反斜杠或尾分隔符（混合分隔符 = 双身份节点）
  if (path.trim() === '') throw new DomainError('INVALID', '来源根路径不能为空白')
  const normalized = normalizePath(path)
  if (normalized === '' || normalized === '/') throw new DomainError('INVALID', '来源根路径不能为空')
  const retired = await svc.store.listRetiredRoots({ workspaceId })
  const wasRetired = retired.some((r) => r.path === normalized)
  await svc.store.transaction(async (db) => {
    await db.addWorkspaceRoot(workspaceId, normalized)
    if (wasRetired) await db.removeRetiredRoot(workspaceId, normalized)
  })
}

/**
 * 卸载来源根：删来源根行 + 其整棵节点树，并落一条退役根记录（同一事务）。
 * 条目不受影响——去留由来源根里的清理操作决定（本函数绝不删条目）。
 */
export async function unmountWorkspaceRoot(
  svc: AppServices,
  workspaceId: Id,
  path: string
): Promise<void> {
  const normalized = normalizePath(path)
  const existed = (await svc.store.listWorkspaceRoots(workspaceId)).some((r) => r.path === normalized)
  const now = svc.clock.now()
  await svc.store.transaction(async (db) => {
    await db.removeWorkspaceRoot(workspaceId, normalized)
    // 只在本就是来源根时记录：对不存在根的卸载请求保持 no-op 语义，不留假记录
    if (existed) await db.addRetiredRoot({ workspaceId, path: normalized, retiredAt: now })
  })
}

/** 退役根视图：路径 + 卸载时间 + 其下条目数（实时前缀统计，不冗余存储）。 */
export interface RetiredRootView {
  path: string
  retiredAt: string
  itemCount: number
}

/** 脱根条目分组（无记录残留按父目录聚合）。 */
export interface DetachedGroup {
  dirPath: string
  count: number
}

/** 来源根视图：退役根（有记录）+ 无记录脱根条目（历史残留）。 */
export interface RootManagementView {
  retired: RetiredRootView[]
  untrackedTotal: number
  untrackedGroups: DetachedGroup[]
}

/** 全部工作区的来源根路径并集（脱根判定的基准）。 */
async function allRootPaths(svc: AppServices): Promise<string[]> {
  const workspaces = await svc.store.listWorkspaces()
  const paths = new Set<string>()
  for (const ws of workspaces) {
    for (const root of await svc.store.listWorkspaceRoots(ws.id)) paths.add(root.path)
  }
  return [...paths]
}

/** 本工作区的退役根列表（含条目数）。 */
export async function listRetiredRoots(
  svc: AppServices,
  workspaceId: Id
): Promise<RetiredRootView[]> {
  const rows = await svc.store.listRetiredRoots({ workspaceId })
  const out: RetiredRootView[] = []
  for (const row of rows) {
    out.push({
      path: row.path,
      retiredAt: row.retiredAt,
      itemCount: await svc.store.countItems({ underDirPath: row.path }),
    })
  }
  return out
}

/**
 * 来源根视图：一次读齐面板需要的两段信息。
 * 脱根条目的判定在存储侧完成（`notUnderAnyDir`）——不把全库条目捞进内存再筛。
 */
export async function rootManagement(
  svc: AppServices,
  workspaceId: Id
): Promise<RootManagementView> {
  const retired = await listRetiredRoots(svc, workspaceId)
  const allRetired = await svc.store.listRetiredRoots({})
  const retiredPaths = allRetired.map((r) => r.path)
  const detached = await svc.store.queryItems({ notUnderAnyDir: await allRootPaths(svc) })

  const counts = new Map<string, number>()
  let untrackedTotal = 0
  for (const { item } of detached) {
    if (item.kind !== 'file') continue
    // 已归因于某条退役记录的，报告在 retired 段；余下的是无记录残留
    if (retiredPaths.some((p) => isUnderDir(p, item.sourceUri))) continue
    untrackedTotal++
    const dir = parentDir(item.sourceUri)
    counts.set(dir, (counts.get(dir) ?? 0) + 1)
  }
  const untrackedGroups: DetachedGroup[] = [...counts]
    .map(([dirPath, count]) => ({ dirPath, count }))
    .sort((a, b) => (a.dirPath < b.dirPath ? -1 : a.dirPath > b.dirPath ? 1 : 0))
  return { retired, untrackedTotal, untrackedGroups }
}

/**
 * 清理脱根条目（**不可恢复**：删条目行及其挂载/作品成员行）。
 *
 * 安全性由构造保证：候选集恒为「当前脱根条目」，再按 dirPath 收窄——即使调用方传入
 * 某个来源根路径，也不会删到任何仍在根下的条目。dirPath 恰好等于某条退役记录路径时，
 * 记录一并收尾（其条目已清空，记录失去意义）。
 */
export async function cleanupDetachedItems(
  svc: AppServices,
  workspaceId: Id,
  dirPath?: string | null
): Promise<{ deleted: number }> {
  const scope = dirPath == null || dirPath === '' ? null : normalizePath(dirPath)
  const query = {
    notUnderAnyDir: await allRootPaths(svc),
    ...(scope != null ? { underDirPath: scope } : {}),
  }
  const hits = await svc.store.queryItems(query)
  const ids = hits.filter((h) => h.item.kind === 'file').map((h) => h.item.id)
  if (ids.length > 0) {
    await svc.store.transaction(async (db) => {
      for (const id of ids) await deleteItemIn(db, id)
    })
  }
  if (scope != null) {
    const records = await svc.store.listRetiredRoots({ workspaceId })
    if (records.some((r) => r.path === scope)) await svc.store.removeRetiredRoot(workspaceId, scope)
  }
  return { deleted: ids.length }
}
