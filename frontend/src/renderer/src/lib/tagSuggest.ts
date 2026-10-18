/**
 * 打标建议的相关性排序（纯规则，D30 可测）。
 *
 * 相关性 = **与该条目已有标签的共现强度**（工作区成员口径的共现对，`tags.pairStats`）：
 * 常与"风景"一起出现的标签排在前面——打标是给相似内容贴相同词，共现就是最直接的
 * "别人都会再挂什么"。无共现数据（条目无标签/统计不可用）退回名单原名序——
 * 排序是增强，不是依赖；候选过滤（未挂载 + 关键字匹配）与排序解耦。
 */

import type { Id } from '@shared/contract'

export interface SuggestTag {
  id: Id
  name: string
}

export function suggestTags(opts: {
  /** 候选全集（工作区已声明的标签，调用方保证名单序）。 */
  candidates: SuggestTag[]
  /** 条目已挂载的标签 id（过滤掉，且是共现的参照系）。 */
  assignedIds: Id[]
  /** 过滤词（标签名包含匹配，大小写不敏感；空串 = 不过滤）。 */
  query: string
  /** 共现次数查询（调用方供数据，本函数不懂存储形状）。 */
  together: (a: Id, b: Id) => number
  /** 返回条数上限（缺省 12）。 */
  limit?: number
}): SuggestTag[] {
  const q = opts.query.trim().toLowerCase()
  const assigned = new Set(opts.assignedIds)
  const scored = opts.candidates
    .filter((t) => !assigned.has(t.id) && (q === '' || t.name.toLowerCase().includes(q)))
    .map((t) => ({
      tag: t,
      co: opts.assignedIds.reduce((sum, x) => sum + (x === t.id ? 0 : opts.together(t.id, x)), 0)
    }))
  scored.sort((x, y) => y.co - x.co || (x.tag.name < y.tag.name ? -1 : x.tag.name > y.tag.name ? 1 : 0))
  return scored.slice(0, opts.limit ?? 12).map((s) => s.tag)
}
