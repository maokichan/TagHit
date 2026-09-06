/**
 * 组（group）维护（应用层用例）：组织标签的扁平容器，成员无序。
 * 删除级联见 cascade.ts。
 */

import type { Group, Id } from '../domain/index.ts'
import type { AppServices } from './services.ts'

export async function createGroup(svc: AppServices, name: string): Promise<Group> {
  const now = svc.clock.now()
  const groupId = svc.idGen.newId()
  await svc.store.createGroup({ id: groupId, name, createdAt: now })
  const created = await svc.store.getGroup(groupId)
  if (!created) throw new Error('createGroup: 创建后组缺失')
  return created
}

export async function renameGroup(svc: AppServices, groupId: Id, name: string): Promise<void> {
  await svc.store.renameGroup(groupId, name)
}

export async function addGroupMember(
  svc: AppServices,
  groupId: Id,
  tagId: Id
): Promise<void> {
  await svc.store.addGroupMember(groupId, tagId)
}

export async function removeGroupMember(
  svc: AppServices,
  groupId: Id,
  tagId: Id
): Promise<void> {
  await svc.store.removeGroupMember(groupId, tagId)
}
