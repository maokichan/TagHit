/**
 * 领域规则（纯函数）：实体与关系的不变量判定。
 * 不持状态、不读写外部；写入时由应用层或适配器调用这些判定。
 *
 * 单一来源纪律：能在 JS 里判定的（自环、排列、标签名口径）一律调用本文件，
 * 适配器不另写一份；只能在存储侧判定的（如标签名唯一性受唯一索引约束）由适配器
 * 做**等价译文**，并在译文处注明对应的领域函数（D28）。
 */

import type { Id, Tag } from './types.ts'

/** 标签名比较键：唯一性、查找与排序三处共用（trim + 小写；D28）。 */
function tagKey(name: string): string {
  return name.trim().toLowerCase()
}

/** 标签名唯一性判定（Tag 实体不变量）。SQLite 译文：LOWER(TRIM(name)) 唯一索引 + 同式查询。 */
export function tagNameTaken(tags: readonly Tag[], name: string): boolean {
  const target = tagKey(name)
  return tags.some((t) => tagKey(t.name) === target)
}

/**
 * 标签名排序口径：与唯一性同一比较键（大小写不敏感）——"不能共存"的名字不会被排得很远；
 * 同键并列时按原始名（码点序）保证确定性。
 */
export function compareTagName(a: { name: string }, b: { name: string }): number {
  const ak = tagKey(a.name)
  const bk = tagKey(b.name)
  if (ak !== bk) return ak < bk ? -1 : 1
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/** 标签关联：自环判定（关联记录结构规则）。 */
export function isSelfLink(from: Id, to: Id): boolean {
  return from === to
}

/**
 * 重排合法性：next 必须是 current 的一个**排列**（集合相同、无重复、无增删）。
 * 防静默丢成员——成员增删走 appendCollectionMember / removeCollectionMember。
 */
export function isPermutationOf(current: readonly Id[], next: readonly Id[]): boolean {
  if (current.length !== next.length) return false
  if (new Set(next).size !== next.length) return false
  const a = [...current].sort()
  const b = [...next].sort()
  return a.every((id, i) => id === b[i])
}
