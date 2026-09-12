/**
 * 一次性数据修复：历史路径双身份（D21）。
 *
 * D18 之前，sourceUri 直接存外部路径（Windows 下可能是反斜杠）。归一化只在**边界**（D18）
 * 对之后写入的路径生效，于是旧行与重扫产生的正斜杠行指向同一个文件：两条条目、同一路径、
 * 同一内容。反斜杠那条永远匹配不到路径节点（节点/比对一律按正斜杠），因而**永久不可见**
 * 且白占查询窗口（真实库 175 条，其中 174 条有孪生行）。
 *
 * 修复是**无损**的：同路径时把旧行的标签与作品成员迁到保留行（重扫得到的当前事实更可信），
 * 保留行缺的派生元数据（哈希/大小/时间/尺寸/缩略图）从旧行补齐，然后删旧行（级联清其关联）。
 * 幂等：修复后不再有反斜杠行，重跑为空操作。
 */

import type { FileItem, Id } from '../domain/index.ts'
import { normalizePath } from '../domain/paths.ts'
import type { AppServices } from './services.ts'
import { deleteItemIn } from './cascade.ts'

export interface LegacyRepairSummary {
  /** 本次检查的 file 条目数。 */
  inspected: number
  /** 无反斜杠 = 无需修复的标志（两段计数均 0）。 */
  normalized: number
  /** 与既有正斜杠行同路径 → 合并（标签/成员迁移后删旧行）。 */
  merged: number
}

/** 修复历史双身份路径；返回计数供宿主日志与校准断言。 */
export async function repairLegacyPaths(svc: AppServices): Promise<LegacyRepairSummary> {
  const hits = await svc.store.queryItems({ kinds: ['file'] })
  const files = hits.filter((h): h is typeof h & { item: FileItem } => h.item.kind === 'file')
  const legacy = files.filter((h) => h.item.sourceUri.includes('\\'))
  if (legacy.length === 0) return { inspected: files.length, normalized: 0, merged: 0 }

  // 既有正斜杠行按归一化路径索引（合并的保留方 = 重扫产物）
  const byUri = new Map<string, FileItem>()
  for (const h of files) {
    if (!h.item.sourceUri.includes('\\')) byUri.set(h.item.sourceUri, h.item)
  }

  let normalized = 0
  let merged = 0
  await svc.store.transaction(async (db) => {
    for (const { item, tags } of legacy) {
      const target = normalizePath(item.sourceUri)
      const keeper = byUri.get(target)
      if (keeper == null) {
        // 无孪生行：原地归一化（条目身份不变，标签/成员随行）
        await db.updateItem(item.id, { sourceUri: target })
        byUri.set(target, { ...item, sourceUri: target })
        normalized++
        continue
      }
      // 合并：标签与作品成员迁到保留行
      for (const tag of tags) await db.attachTag(keeper.id, tag.id)
      for (const member of await db.listCollectionMemberships({ itemId: item.id })) {
        const members = await db.listCollectionMemberships({ collectionId: member.collectionId })
        if (!members.some((m) => m.itemId === keeper.id)) {
          await db.appendCollectionMember(member.collectionId, keeper.id)
        }
      }
      // 保留行缺的派生元数据从旧行补齐（不覆盖既有值：重扫产物更可信）
      const patch: Parameters<typeof db.updateItem>[1] = {}
      if (keeper.contentHash == null && item.contentHash != null) patch.contentHash = item.contentHash
      if (keeper.size == null && item.size != null) patch.size = item.size
      if (keeper.fileModifiedAt == null && item.fileModifiedAt != null) {
        patch.fileModifiedAt = item.fileModifiedAt
      }
      if ((keeper.width ?? null) == null && (item.width ?? null) != null) patch.width = item.width
      if ((keeper.height ?? null) == null && (item.height ?? null) != null) patch.height = item.height
      if ((keeper.previewUri ?? null) == null && (item.previewUri ?? null) != null) {
        patch.previewUri = item.previewUri
      }
      if (Object.keys(patch).length > 0) await db.updateItem(keeper.id, patch)
      await deleteItemIn(db, item.id)
      merged++
    }
  })
  return { inspected: files.length, normalized, merged }
}

/** 判定标签 id 是否仍被引用（校准与调试用；迁移后旧行已删，挂载应全部落在保留行）。 */
export async function attachmentsOf(svc: AppServices, itemId: Id): Promise<Id[]> {
  const rows = await svc.store.listAttachments({ itemId })
  return rows.map((r) => r.tagId)
}
