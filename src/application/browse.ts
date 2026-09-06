/**
 * 浏览与声明投影（应用层用例）。
 * 声明 = 工作区 × 标签的读取端投影事实：取回条目的全部标签后，
 * 只交付该工作区已声明的子集，未声明者不交付（隐藏）。
 * 条目的「属于哪个工作区」由来源路径树决定（规划中），本用例暂按查询条件返回条目。
 */

import type { Id, Item, Tag } from '../domain/index.ts'
import type { ItemsQuery } from '../ports/index.ts'
import type { AppServices } from './services.ts'

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

/** 浏览工作区：查询条件返回的条目，标签交付时按该工作区声明集合投影。 */
export async function browseWorkspace(
  svc: AppServices,
  workspaceId: Id,
  q: ItemsQuery = {}
): Promise<ProjectedHit[]> {
  const declared = new Set(await declaredTagIds(svc, workspaceId))
  const hits = await svc.store.queryItems(q)
  return hits.map(({ item, tags }) => {
    const visible = tags.filter((tag) => declared.has(tag.id))
    return { item, tags: visible, hiddenCount: tags.length - visible.length }
  })
}
