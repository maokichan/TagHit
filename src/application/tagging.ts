/**
 * 打标 / 卸标 / 声明（应用层用例）。
 * 打标一次可带多个标签并整体原子：任一失败 → 全部回滚，不留部分挂载。
 * 标签关联的「语义带出」（按关联自动补标）属后续语义模块，本层不做。
 */

import type { Id, Tag } from '../domain/index.ts'
import type { AppServices } from './services.ts'

/** 建标签（薄封装：id / createdAt 注入后落库；空名 / 重名判定在 Store）。 */
export async function createTag(
  svc: AppServices,
  input: { name: string; description?: string | null }
): Promise<Tag> {
  const now = svc.clock.now()
  return svc.store.createTag({
    id: svc.idGen.newId(),
    name: input.name,
    description: input.description,
    createdAt: now,
  })
}

/** 打标：给条目挂一组标签（整体原子）。 */
export async function tagItem(svc: AppServices, itemId: Id, tagIds: Id[]): Promise<void> {
  await svc.store.transaction(async (tx) => {
    for (const tagId of tagIds) {
      await tx.attachTag(itemId, tagId)
    }
  })
}

/** 卸标：从条目卸下一组标签（整体原子；不存在的挂载行是 no-op）。 */
export async function untagItem(svc: AppServices, itemId: Id, tagIds: Id[]): Promise<void> {
  await svc.store.transaction(async (tx) => {
    for (const tagId of tagIds) {
      await tx.detachTag(itemId, tagId)
    }
  })
}

/** 批量打标：给一组条目挂一组标签（单事务整体原子；任一失败 → 全部回滚）。 */
export async function tagItems(svc: AppServices, itemIds: Id[], tagIds: Id[]): Promise<void> {
  await svc.store.transaction(async (tx) => {
    for (const itemId of itemIds) {
      for (const tagId of tagIds) {
        await tx.attachTag(itemId, tagId)
      }
    }
  })
}

/** 批量卸标：从一组条目卸下一组标签（单事务整体原子；不存在的挂载行是 no-op）。 */
export async function untagItems(svc: AppServices, itemIds: Id[], tagIds: Id[]): Promise<void> {
  await svc.store.transaction(async (tx) => {
    for (const itemId of itemIds) {
      for (const tagId of tagIds) {
        await tx.detachTag(itemId, tagId)
      }
    }
  })
}

/** 声明：工作区 × 标签（浏览投影的依据；已声明 → no-op）。 */
export async function declareTag(svc: AppServices, workspaceId: Id, tagId: Id): Promise<void> {
  await svc.store.declareTag(workspaceId, tagId)
}

/** 撤销声明（行不存在 → no-op）。 */
export async function undeclareTag(svc: AppServices, workspaceId: Id, tagId: Id): Promise<void> {
  await svc.store.undeclareTag(workspaceId, tagId)
}
