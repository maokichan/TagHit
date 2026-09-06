/**
 * 领域规则（纯函数）：实体与关系的不变量判定。
 * 不持状态、不读写外部；写入时由应用层调用这些判定。
 */

import type { Id, Tag, TagLink } from './types.ts'

/** 标签名规范化（创建/改名前的值处理）。 */
export function normalizeTagName(name: string): string {
  return name.trim()
}

/** 标签名唯一性判定（Tag 实体不变量）。 */
export function tagNameTaken(tags: readonly Tag[], name: string): boolean {
  const target = name.trim().toLowerCase()
  return tags.some((t) => t.name.trim().toLowerCase() === target)
}

/** 按名查找（唯一性判定与报错用）。 */
export function findTagNamed(tags: readonly Tag[], name: string): Tag | undefined {
  const target = name.trim().toLowerCase()
  return tags.find((t) => t.name.trim().toLowerCase() === target)
}

/** 标签关联：自环判定（关联记录结构规则）。 */
export function isSelfLink(link: TagLink): boolean {
  return link.from === link.to
}

/** 标签关联：是否已存在同向关联（唯一性判定）。 */
export function hasDirectedLink(links: readonly TagLink[], from: Id, to: Id): boolean {
  return links.some((l) => l.from === from && l.to === to)
}

/** 去重（同向重复保留首个），返回新列表。 */
export function uniqueDirectedLinks(links: readonly TagLink[]): TagLink[] {
  const seen = new Set<string>()
  const out: TagLink[] = []
  for (const l of links) {
    const key = `${l.from}\u0000${l.to}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(l)
  }
  return out
}
