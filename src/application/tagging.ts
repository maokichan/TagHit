/**
 * 打标 / 卸标 / 声明（应用层用例）。
 * 打标一次可带多个标签并整体原子：任一失败 → 全部回滚，不留部分挂载。
 * 标签关联的「语义带出」（按关联自动补标）属后续语义模块，本层不做。
 */

import type { Id, Tag } from '../domain/index.ts'
import type { AppServices } from './services.ts'
import { normalizeName } from './input.ts'

/** 建标签（薄封装：id / createdAt 注入后落库；空名 / 重名判定在 Store）。 */
export async function createTag(
  svc: AppServices,
  input: { name: string; description?: string | null }
): Promise<Tag> {
  const now = svc.clock.now()
  return svc.store.createTag({
    id: svc.idGen.newId(),
    name: normalizeName(input.name, '标签名'),
    description: input.description,
    createdAt: now,
  })
}

/** 改标签描述（标签全页；NOT_FOUND 透传）。 */
export async function updateTagDescription(
  svc: AppServices,
  tagId: Id,
  description: string | null
): Promise<void> {
  await svc.store.updateTag(tagId, { description })
}

/** 标签池统计（全局口径；标签全页总表）。 */
export async function tagStats(svc: AppServices) {
  return svc.store.tagStats()
}

/**
 * 标签对统计（共现 / 互斥）。成员口径 = 工作区浏览成员（直接节点 included），
 * 与浏览同一份派生——"这个库里实际一起看的内容"才配谈关系。limit 在此钳制。
 */
export async function tagPairStats(
  svc: AppServices,
  q: { workspaceId: Id; kind: 'cooccur' | 'mutex'; limit: number }
) {
  return svc.store.tagPairStats({ ...q, limit: Math.max(1, Math.min(100, q.limit)) })
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
