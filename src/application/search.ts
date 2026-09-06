/**
 * 检索（应用层用例）：把用户输入组装为下沉查询条件对象，其余筛选语义交给存储。
 * 检索对象是条目与标签；全局（对全部工作区）。
 */

import type { Id, Item, Tag } from '../domain/index.ts'
import type { ItemHit, ItemsQuery } from '../ports/index.ts'
import type { AppServices } from './services.ts'

export interface SearchItemsOptions {
  /** 自由文本（命中条目标题子串）。 */
  text?: string
  /** 标签过滤。 */
  tagIds?: Id[]
  /** true = 命中全部给定标签；缺省 = 命中任一。 */
  matchAllTags?: boolean
  kinds?: Item['kind'][]
}

/** 检索条目。 */
export async function searchItems(
  svc: AppServices,
  opts: SearchItemsOptions = {}
): Promise<ItemHit[]> {
  const q: ItemsQuery = {}
  const text = opts.text?.trim()
  if (text) q.titleContains = text
  const tagIds = opts.tagIds?.length ? opts.tagIds : undefined
  if (tagIds) {
    if (opts.matchAllTags) q.withAllTags = tagIds
    else q.withAnyTag = tagIds
  }
  if (opts.kinds?.length) q.kinds = opts.kinds
  return svc.store.queryItems(q)
}

/** 检索标签（按名子串）。 */
export async function searchTags(svc: AppServices, text?: string): Promise<Tag[]> {
  const trimmed = text?.trim()
  return svc.store.queryTags(trimmed ? { nameContains: trimmed } : undefined)
}
