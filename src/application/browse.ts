/**
 * 浏览与声明投影（应用层用例）。
 *
 * 成员资格 = **派生**：file 条目可见于某工作区，当且仅当其直接节点
 * （sourceUri 父目录对应的 PathNode）存在且 included；anchor 条目无来源、不进工作区视图。
 * 声明投影 = 交付标签取 条目全部标签 ∩ 工作区声明子集（未声明者不交付，记入 hiddenCount）。
 */

import type { Id, Item, Tag } from '../domain/index.ts'
import type { ItemsQuery } from '../ports/index.ts'
import type { AppServices } from './services.ts'
import { parentDir } from './paths.ts'

/** 投影后的条目视图。 */
export interface ProjectedHit {
  item: Item
  /** 交付标签（声明子集；保持存储返回的按名升序）。 */
  tags: Tag[]
  /** 未声明而未交付的标签数。 */
  hiddenCount: number
}

/** 工作区已声明的标签 id 集合（投影依据）。 */
export async function declaredTagIds(svc: AppServices, workspaceId: Id): Promise<Id[]> {
  const rows = await svc.store.listDeclarations({ workspaceId })
  return rows.map((row) => row.tagId)
}

/**
 * 浏览工作区：先按查询条件取条目，再做**工作区成员派生**（直接节点 included）
 * 与标签声明投影。查询条件只作为附加过滤，不能越出工作区成员集。
 */
export async function browseWorkspace(
  svc: AppServices,
  workspaceId: Id,
  q: ItemsQuery = {}
): Promise<ProjectedHit[]> {
  const stateByDir = new Map<string, string>()
  for (const node of await svc.store.listPathNodes({ workspaceId })) {
    stateByDir.set(node.dirPath, node.state)
  }
  const declared = new Set(await declaredTagIds(svc, workspaceId))
  const hits = await svc.store.queryItems(q)
  const out: ProjectedHit[] = []
  for (const { item, tags } of hits) {
    if (item.kind !== 'file') continue // anchor 无来源，不进工作区视图
    const dir = parentDir(item.sourceUri)
    if (stateByDir.get(dir) !== 'included') continue // 成员派生：直接节点须存在且 included
    const visible = tags.filter((tag) => declared.has(tag.id))
    out.push({ item, tags: visible, hiddenCount: tags.length - visible.length })
  }
  return out
}
