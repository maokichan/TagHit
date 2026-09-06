/**
 * 删除级联（应用层用例）。
 * 每个删除都在**单个事务**内：先经反查原语清掉全部关联行，再删实体行——
 * 任一步失败整体回滚，不残留悬挂引用。
 * 各实体删除语义：
 * - 标签：清挂载 / 双向标签关联 / 声明 / 组成员行；
 * - 条目：清挂载与所在作品的成员行；
 * - 作品：清其成员行 → 级联删除锚条目（含锚的挂载等）→ 删作品行；
 * - 组：清组成员行；
 * - 工作区：清声明行。
 */

import { DomainError } from '../domain/index.ts'
import type { Id } from '../domain/index.ts'
import type { Store } from '../ports/index.ts'
import type { AppServices } from './services.ts'

/** 事务内：删除条目并清理其挂载与作品成员行。 */
async function deleteItemIn(db: Store, itemId: Id): Promise<void> {
  for (const row of await db.listAttachments({ itemId })) {
    await db.detachTag(itemId, row.tagId)
  }
  for (const member of await db.listCollectionMemberships({ itemId })) {
    await db.removeCollectionMember(member.collectionId, itemId)
  }
  await db.deleteItem(itemId)
}

export async function deleteItemCascade(svc: AppServices, itemId: Id): Promise<void> {
  await svc.store.transaction((db) => deleteItemIn(db, itemId))
}

export async function deleteTagCascade(svc: AppServices, tagId: Id): Promise<void> {
  await svc.store.transaction(async (db) => {
    for (const row of await db.listAttachments({ tagId })) {
      await db.detachTag(row.itemId, tagId)
    }
    for (const link of await db.listTagLinks({ from: tagId })) {
      await db.unlinkTag(tagId, link.to)
    }
    for (const link of await db.listTagLinks({ to: tagId })) {
      await db.unlinkTag(link.from, tagId)
    }
    for (const row of await db.listDeclarations({ tagId })) {
      await db.undeclareTag(row.workspaceId, tagId)
    }
    for (const member of await db.listGroupMemberships({ tagId })) {
      await db.removeGroupMember(member.groupId, tagId)
    }
    await db.deleteTag(tagId)
  })
}

export async function deleteCollectionCascade(svc: AppServices, collectionId: Id): Promise<void> {
  await svc.store.transaction(async (db) => {
    for (const member of await db.listCollectionMemberships({ collectionId })) {
      await db.removeCollectionMember(collectionId, member.itemId)
    }
    const collection = await db.getCollection(collectionId)
    if (!collection) throw new DomainError('NOT_FOUND', `作品 不存在（${collectionId}）`)
    // 先删 collection 行再级联删锚条目：SQLite 外键（collections.anchorItemId → items.id）要求先解除引用
    await db.deleteCollection(collectionId)
    await deleteItemIn(db, collection.anchorItemId)
  })
}

export async function deleteGroupCascade(svc: AppServices, groupId: Id): Promise<void> {
  await svc.store.transaction(async (db) => {
    for (const member of await db.listGroupMemberships({ groupId })) {
      await db.removeGroupMember(groupId, member.tagId)
    }
    await db.deleteGroup(groupId)
  })
}

export async function deleteWorkspaceCascade(svc: AppServices, workspaceId: Id): Promise<void> {
  await svc.store.transaction(async (db) => {
    for (const row of await db.listDeclarations({ workspaceId })) {
      await db.undeclareTag(workspaceId, row.tagId)
    }
    await db.deleteWorkspace(workspaceId)
  })
}
