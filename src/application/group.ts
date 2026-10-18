/**
 * 组（group）维护（应用层用例）：组织标签的扁平容器，成员无序。
 * 删除级联见 cascade.ts。
 */

import type { Group, Id } from '../domain/index.ts'
import type { AppServices } from './services.ts'
import { normalizeName } from './input.ts'

export async function createGroup(svc: AppServices, name: string): Promise<Group> {
  const now = svc.clock.now()
  return svc.store.createGroup({ id: svc.idGen.newId(), name: normalizeName(name, '组名'), createdAt: now })
}

export async function renameGroup(svc: AppServices, groupId: Id, name: string): Promise<void> {
  await svc.store.renameGroup(groupId, normalizeName(name, '组名'))
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

/** 全部组（插入序；组管理页按名重排在渲染层做）。 */
export async function listGroups(svc: AppServices): Promise<Group[]> {
  return svc.store.listGroups()
}

/** 组成员关系（groupId × tagId 行）。 */
export async function listGroupMemberships(svc: AppServices) {
  return svc.store.listGroupMemberships()
}
