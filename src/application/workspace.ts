/**
 * 工作区维护（应用层用例，薄封装）。
 * 0.2 工作区 = 名称 + 来源根集合（挂载/卸载/扫描见 scan.ts）；
 * 封面、描述等旧版能力不在本轮范围。删除级联见 cascade.ts。
 */

import type { Id, Workspace, WorkspaceRoot } from '../domain/index.ts'
import type { AppServices } from './services.ts'

/** 建工作区（薄封装：id / createdAt 注入后落库）。 */
export async function createWorkspace(svc: AppServices, name: string): Promise<Workspace> {
  const now = svc.clock.now()
  return svc.store.createWorkspace({ id: svc.idGen.newId(), name, createdAt: now })
}

/** 工作区列表（按存储序）。 */
export async function listWorkspaces(svc: AppServices): Promise<Workspace[]> {
  return svc.store.listWorkspaces()
}

/** 读单个工作区；不存在返回 null。 */
export async function getWorkspace(svc: AppServices, id: Id): Promise<Workspace | null> {
  return svc.store.getWorkspace(id)
}

/** 来源根列表（读宽松：工作区不存在返回空）。 */
export async function listWorkspaceRoots(
  svc: AppServices,
  workspaceId: Id
): Promise<WorkspaceRoot[]> {
  return svc.store.listWorkspaceRoots(workspaceId)
}
