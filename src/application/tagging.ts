/**
 * 打标 / 卸标（应用层用例）。
 * 一次操作可带多个标签并整体原子：任一失败 → 全部回滚，不留部分挂载。
 * 标签关联的「语义带出」（按关联自动补标）属后续语义模块，本层不做。
 */

import type { Id } from '../domain/index.ts'
import type { AppServices } from './services.ts'

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
