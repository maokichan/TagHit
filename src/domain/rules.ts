/**
 * 领域规则（纯函数）：实体与关系的不变量判定。
 * 不持状态、不读写外部；写入时由应用层或适配器调用这些判定。
 *
 * 单一来源纪律：能在 JS 里判定的（自环、排列、标签名口径）一律调用本文件，
 * 适配器不另写一份；只能在存储侧判定的（如标签名唯一性受唯一索引约束）由适配器
 * 做**等价译文**，并在译文处注明对应的领域函数（D28）。
 */

import { DomainError } from './errors.ts'
import type { Id, Tag, TagProfile } from './types.ts'

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

/**
 * 文件名的扩展名（最后一个点之后的小写尾段）。
 * 边界口径：点在首位（".hidden"）与末位（"name."）、无点，都不是扩展名 → null。
 * 查询条件 ItemsQuery.extensions 的判定基准；sqlite 侧是
 * `LOWER(title) LIKE '%.ext' AND 首字符 <> '.'` 的等价译文（s35 校准逐一致比对）。
 */
export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  return name.slice(dot + 1).toLowerCase()
}

// ---- 标签主页文档（TagProfile）----------------------------------------------

/** 文档容量边界（写入口径，双适配器同源）：超出即 INVALID，不静默截断。 */
export const TAG_PROFILE_BODY_MAX = 100_000
export const TAG_PROFILE_LINKS_MAX = 100
export const TAG_PROFILE_LINK_LABEL_MAX = 200
export const TAG_PROFILE_LINK_URL_MAX = 2000

/**
 * 标签主页文档校验与归一（唯一实现，宿主写入口与存储读出口共用同一份）：
 * - 非 JSON 对象 / schemaVersion 不是当前已知版本 → INVALID（版本错位是硬错误，不猜）；
 * - body = null 或封顶内字符串；links = {label, url} 有序数组（逐项去空白、封顶）。
 * 读侧遇到坏文档（手工改库等）经此暴露为 INVALID，而不是把坏数据渲染进页面。
 */
export function normalizeTagProfile(raw: unknown): TagProfile {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DomainError('INVALID', '标签主页文档必须是 JSON 对象')
  }
  const o = raw as Record<string, unknown>
  if (o.schemaVersion !== 1) {
    throw new DomainError('INVALID', `标签主页文档版本不支持：${String(o.schemaVersion)}`)
  }
  const body = o.body
  if (body != null && (typeof body !== 'string' || body.length > TAG_PROFILE_BODY_MAX)) {
    throw new DomainError('INVALID', '标签主页正文超限或类型不对')
  }
  if (!Array.isArray(o.links) || o.links.length > TAG_PROFILE_LINKS_MAX) {
    throw new DomainError('INVALID', '标签主页链接列表超限或类型不对')
  }
  const links = o.links.map((l): { label: string; url: string } => {
    if (l == null || typeof l !== 'object') {
      throw new DomainError('INVALID', '链接项必须是 {label, url}')
    }
    const rec = l as Record<string, unknown>
    const label = typeof rec.label === 'string' ? rec.label.trim() : ''
    const url = typeof rec.url === 'string' ? rec.url.trim() : ''
    if (label === '' || label.length > TAG_PROFILE_LINK_LABEL_MAX) {
      throw new DomainError('INVALID', '链接名不能为空且须在长度内')
    }
    if (url === '' || url.length > TAG_PROFILE_LINK_URL_MAX) {
      throw new DomainError('INVALID', '链接地址不能为空且须在长度内')
    }
    return { label, url }
  })
  return { schemaVersion: 1, body: body ?? null, links }
}
