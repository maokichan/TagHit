/**
 * 领域规则（纯函数）：命名、标签关联的结构不变量、有向图派生。
 * 不持状态、不读写外部；写入时的强制执行在应用层。
 */

import type { Id, Tag, TagLink } from './types'

// ── 命名 ──────────────────────────────────────────────

export function normalizeTagName(name: string): string {
  return name.trim()
}

export function tagNameTaken(tags: readonly Tag[], name: string): boolean {
  const target = name.trim().toLowerCase()
  return tags.some((t) => t.name.trim().toLowerCase() === target)
}

export function findTagNamed(tags: readonly Tag[], name: string): Tag | undefined {
  const target = name.trim().toLowerCase()
  return tags.find((t) => t.name.trim().toLowerCase() === target)
}

// ── 标签关联的结构不变量 ──────────────────────────────

export function isSelfLink(link: TagLink): boolean {
  return link.from === link.to
}

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

// ── 有向图派生 ────────────────────────────────────────

/** from → [to, …] */
export function indexOutgoing(links: readonly TagLink[]): Map<Id, Id[]> {
  const map = new Map<Id, Id[]>()
  for (const l of links) {
    const arr = map.get(l.from) ?? []
    arr.push(l.to)
    map.set(l.from, arr)
  }
  return map
}

/** to → [from, …] */
export function indexIncoming(links: readonly TagLink[]): Map<Id, Id[]> {
  const map = new Map<Id, Id[]>()
  for (const l of links) {
    const arr = map.get(l.to) ?? []
    arr.push(l.from)
    map.set(l.to, arr)
  }
  return map
}

/**
 * 沿出向（from→to）从 start 出发的可达集（不含 start）。
 * 若 is-a 组织为 子→父，即某标签的祖先集。
 */
export function reachableViaOut(outgoing: Map<Id, Id[]>, start: Id): Set<Id> {
  const seen = new Set<Id>()
  const queue: Id[] = [...(outgoing.get(start) ?? [])]
  while (queue.length > 0) {
    const cur = queue.pop() as Id
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const next of outgoing.get(cur) ?? []) queue.push(next)
  }
  return seen
}

/**
 * 沿入向（to → from 反向）从 start 出发的可达集（不含 start）。
 * 若 is-a 组织为 子→父，即某标签的后代集。
 */
export function reachableViaIn(incoming: Map<Id, Id[]>, start: Id): Set<Id> {
  const seen = new Set<Id>()
  const queue: Id[] = [...(incoming.get(start) ?? [])]
  while (queue.length > 0) {
    const cur = queue.pop() as Id
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const next of incoming.get(cur) ?? []) queue.push(next)
  }
  return seen
}

/** 新增 from → to 是否成环：to 已可沿出向到达 from，或 from === to。 */
export function wouldCreateCycle(links: readonly TagLink[], from: Id, to: Id): boolean {
  if (from === to) return true
  const outgoing = indexOutgoing(links)
  return reachableViaOut(outgoing, to).has(from)
}
