/**
 * 作品（collection）维护（应用层用例）。
 * 作品 = 有序成员 + 锚条目（承载作品标签）。删除级联见 cascade.ts。
 */

import type { Collection, Id } from '../domain/index.ts'
import type { AppServices } from './services.ts'
import { normalizeName } from './input.ts'

/** 建作品：同一事务内先建空条目·锚（承接标签），再建作品本体。事务提交即返回创建的作品。 */
export async function createCollection(svc: AppServices, name: string): Promise<Collection> {
  const now = svc.clock.now()
  const collectionId = svc.idGen.newId()
  const anchorId = svc.idGen.newId()
  const normalized = normalizeName(name, '作品名')
  return svc.store.transaction(async (tx) => {
    await tx.createItem({ kind: 'anchor', id: anchorId, title: normalized, createdAt: now })
    return tx.createCollection({ id: collectionId, name: normalized, anchorItemId: anchorId, createdAt: now })
  })
}

export async function renameCollection(
  svc: AppServices,
  collectionId: Id,
  name: string
): Promise<void> {
  await svc.store.renameCollection(collectionId, normalizeName(name, '作品名'))
}

/** 末尾追加有序成员。 */
export async function appendCollectionMember(
  svc: AppServices,
  collectionId: Id,
  itemId: Id
): Promise<void> {
  await svc.store.appendCollectionMember(collectionId, itemId)
}

export async function removeCollectionMember(
  svc: AppServices,
  collectionId: Id,
  itemId: Id
): Promise<void> {
  await svc.store.removeCollectionMember(collectionId, itemId)
}

/** 整体重排：orderedItemIds 须为当前成员集合的一个排列（防静默丢成员）。 */
export async function reorderCollectionMembers(
  svc: AppServices,
  collectionId: Id,
  orderedItemIds: Id[]
): Promise<void> {
  await svc.store.reorderCollectionMembers(collectionId, orderedItemIds)
}
