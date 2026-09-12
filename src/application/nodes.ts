/**
 * 路径节点用例（来源根树的读与可见性）。
 *
 * 节点由扫描维护（含来源根本身 = 根节点）；本组用例只做：
 * - 列出工作区全部节点（树形由目录路径前缀关系在渲染层派生，不另建树用例）；
 * - 单节点 / 子树（含自身 + 全部后代，单事务）设置 included/excluded。
 * 语义纪律：可见性**不级联**是域模型现状——子树设置为批量便捷入口，不改变单节点语义。
 * 变更后浏览投影即变；调用方（渲染层）负责失效重查。
 */

import type { Id, NodeState, PathNode } from '../domain/index.ts'
import { DomainError } from '../domain/index.ts'
import type { AppServices } from './services.ts'
import { isUnderRoot, normalizePath } from './paths.ts'

/** 列出工作区全部路径节点（含各来源根根节点；按存储返回序）。 */
export async function listWorkspaceNodes(
  svc: AppServices,
  workspaceId: Id
): Promise<PathNode[]> {
  return svc.store.listPathNodes({ workspaceId })
}

/** 断言 dirPath 位于工作区某来源根之下（路径段匹配）；越界 → NOT_FOUND。 */
async function assertUnderRoot(svc: AppServices, workspaceId: Id, dirPath: string): Promise<void> {
  const roots = await svc.store.listWorkspaceRoots(workspaceId)
  const p = normalizePath(dirPath)
  if (!isUnderRoot(roots.map((r) => r.path), p)) {
    throw new DomainError('NOT_FOUND', `路径不在工作区来源根之下（${p}）`)
  }
}

/** 设置单节点可见性。节点行不存在（未扫描到）→ NOT_FOUND（适配器抛出）。 */
export async function setNodeState(
  svc: AppServices,
  workspaceId: Id,
  dirPath: string,
  state: NodeState
): Promise<void> {
  await assertUnderRoot(svc, workspaceId, dirPath)
  await svc.store.setPathNodeState(workspaceId, normalizePath(dirPath), state)
}

/** 子树可见性：dirPath 自身 + 全部后代节点，单事务批量设置（批量入口，非级联语义）。 */
export async function setSubtreeState(
  svc: AppServices,
  workspaceId: Id,
  dirPath: string,
  state: NodeState
): Promise<void> {
  await assertUnderRoot(svc, workspaceId, dirPath)
  const base = normalizePath(dirPath)
  const nodes = await svc.store.listPathNodes({ workspaceId })
  const targets = nodes.filter((n) => n.dirPath === base || n.dirPath.startsWith(`${base}/`))
  if (targets.length === 0) {
    throw new DomainError('NOT_FOUND', `路径节点不存在（${dirPath}）`)
  }
  await svc.store.transaction(async (db) => {
    for (const n of targets) {
      await db.setPathNodeState(workspaceId, n.dirPath, state)
    }
  })
}
