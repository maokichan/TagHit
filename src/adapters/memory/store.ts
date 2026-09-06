/**
 * 内存适配器：实现 Store 端口（src/ports/store.ts）。
 *
 * 用途：开发期与测试的存储替身——不落盘、进程内驻留，
 * 让应用层用例先跑通、把端口契约校准到位（SQLite 适配器随后按同一接口实现）。
 *
 * 事务实现 = clone-on-write：
 * - transaction(fn)：先克隆当前状态 → fn 在克隆态上执行 → 成功则以克隆态替换当前态，
 *   抛错则丢弃克隆态（整体回滚，无部分写入）。行对象一律不可变，改动即换新对象，
 *   因此浅克隆 Map 即安全。
 * - 顶层单条读写：直接作用于当前态（单步 Map 操作在 JS 单线程内天然原子）。
 * - 不支持嵌套 transaction：对已在事务作用域内的 Store 再调 transaction → INVALID。
 *
 * 纪律：本文件只做「存储机制语义」（存在性/唯一/有序/原子），不做业务判定——
 * 规则在 domain/rules.ts，编排在应用层用例。
 */

import { DomainError } from '../../domain'
import type {
  Collection,
  CollectionMember,
  Declaration,
  Group,
  GroupMember,
  Id,
  Item,
  ItemAttach,
  ItemStatus,
  Tag,
  TagLink,
  Workspace,
} from '../../domain'
import type {
  ItemHit,
  ItemsQuery,
  NewCollection,
  NewGroup,
  NewTag,
  NewWorkspace,
  Store,
  TagsQuery,
} from '../../ports/store'

// ---------------------------------------------------------------------------
// 状态与克隆
// ---------------------------------------------------------------------------

interface State {
  tags: Map<Id, Tag>
  items: Map<Id, Item>
  workspaces: Map<Id, Workspace>
  collections: Map<Id, Collection>
  groups: Map<Id, Group>
  attachments: Map<string, ItemAttach>
  tagLinks: Map<string, TagLink>
  declarations: Map<string, Declaration>
  collectionMembers: Map<string, CollectionMember>
  groupMembers: Map<string, GroupMember>
}

function createEmptyState(): State {
  return {
    tags: new Map(),
    items: new Map(),
    workspaces: new Map(),
    collections: new Map(),
    groups: new Map(),
    attachments: new Map(),
    tagLinks: new Map(),
    declarations: new Map(),
    collectionMembers: new Map(),
    groupMembers: new Map(),
  }
}

/** 浅克隆全部 Map；行对象不可变（改动即换新对象），故无需深克隆。 */
function cloneState(s: State): State {
  return {
    tags: new Map(s.tags),
    items: new Map(s.items),
    workspaces: new Map(s.workspaces),
    collections: new Map(s.collections),
    groups: new Map(s.groups),
    attachments: new Map(s.attachments),
    tagLinks: new Map(s.tagLinks),
    declarations: new Map(s.declarations),
    collectionMembers: new Map(s.collectionMembers),
    groupMembers: new Map(s.groupMembers),
  }
}

const pairKey = (a: Id, b: Id): string => `${a}\u0000${b}`

function byNameAsc(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

// ---------------------------------------------------------------------------
// 错误辅助
// ---------------------------------------------------------------------------

function notFound(entity: string, id: Id): DomainError {
  return new DomainError('NOT_FOUND', `${entity} 不存在（${id}）`)
}

function conflict(message: string): DomainError {
  return new DomainError('CONFLICT', message)
}

function invalid(message: string): DomainError {
  return new DomainError('INVALID', message)
}

// ---------------------------------------------------------------------------
// MemoryStore
// ---------------------------------------------------------------------------

export class MemoryStore implements Store {
  private state: State

  /** 事务深度：0 = 顶层；>0 = 已在事务内（禁止嵌套）。 */
  private depth: number

  constructor(state: State = createEmptyState(), depth = 0) {
    this.state = state
    this.depth = depth
  }

  // ---- 事务 ---------------------------------------------------------------

  async transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    if (this.depth > 0) throw invalid('不支持嵌套事务')
    const work = cloneState(this.state)
    const tx = new MemoryStore(work, this.depth + 1)
    try {
      const result = await fn(tx)
      this.state = work
      return result
    } catch (error) {
      // 丢弃 work：整体回滚
      throw error
    }
  }

  // ---- 标签 ---------------------------------------------------------------

  async createTag(input: NewTag): Promise<Tag> {
    const name = input.name.trim()
    if (name.length === 0) throw invalid('标签名不能为空')
    if (this.hasTagNamed(name)) throw conflict(`标签名已存在：${name}`)
    if (this.state.tags.has(input.id)) throw conflict(`标签 id 重复：${input.id}`)
    const tag: Tag = {
      id: input.id,
      name,
      description: input.description ?? null,
      createdAt: input.createdAt,
    }
    this.state.tags.set(tag.id, tag)
    return tag
  }

  async updateTag(id: Id, patch: { description?: string | null }): Promise<void> {
    const old = this.state.tags.get(id)
    if (!old) throw notFound('标签', id)
    this.state.tags.set(id, {
      ...old,
      description: patch.description === undefined ? old.description : patch.description,
    })
  }

  async deleteTag(id: Id): Promise<void> {
    if (!this.state.tags.delete(id)) throw notFound('标签', id)
  }

  async getTag(id: Id): Promise<Tag | null> {
    return this.state.tags.get(id) ?? null
  }

  async findTagByName(name: string): Promise<Tag | null> {
    const target = name.trim().toLowerCase()
    for (const tag of this.state.tags.values()) {
      if (tag.name.trim().toLowerCase() === target) return tag
    }
    return null
  }

  async queryTags(q?: TagsQuery): Promise<Tag[]> {
    const ids = q?.ids ? new Set(q.ids) : null
    const contains = q?.nameContains?.trim().toLowerCase()
    const out: Tag[] = []
    for (const tag of this.state.tags.values()) {
      if (ids && !ids.has(tag.id)) continue
      if (contains && !tag.name.toLowerCase().includes(contains)) continue
      out.push(tag)
    }
    out.sort(byNameAsc)
    return out
  }

  // ---- 条目 ---------------------------------------------------------------

  async createItem(item: Item): Promise<Item> {
    if (this.state.items.has(item.id)) throw conflict(`条目 id 重复：${item.id}`)
    this.state.items.set(item.id, item)
    return item
  }

  async updateItem(id: Id, patch: { title?: string; status?: ItemStatus }): Promise<void> {
    const old = this.state.items.get(id)
    if (!old) throw notFound('条目', id)
    const next: Item =
      old.kind === 'file'
        ? {
            ...old,
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
          }
        : {
            ...old,
            ...(patch.title !== undefined ? { title: patch.title } : {}),
          }
    this.state.items.set(id, next)
  }

  async deleteItem(id: Id): Promise<void> {
    if (!this.state.items.delete(id)) throw notFound('条目', id)
  }

  async getItem(id: Id): Promise<Item | null> {
    return this.state.items.get(id) ?? null
  }

  async queryItems(q: ItemsQuery = {}): Promise<ItemHit[]> {
    const ids = q.ids ? new Set(q.ids) : null
    const kinds = q.kinds ? new Set(q.kinds) : null
    const titleContains = q.titleContains?.trim().toLowerCase()
    const prefix = q.sourceUriPrefix
    const anyTags = q.withAnyTag ? new Set(q.withAnyTag) : null
    const allTags = q.withAllTags ? new Set(q.withAllTags) : null

    const hits: ItemHit[] = []
    for (const item of this.state.items.values()) {
      if (ids && !ids.has(item.id)) continue
      if (kinds && !kinds.has(item.kind)) continue
      if (q.status !== undefined && (item.kind !== 'file' || item.status !== q.status)) continue
      if (titleContains && !item.title.toLowerCase().includes(titleContains)) continue
      if (prefix && (item.kind !== 'file' || !item.sourceUri.startsWith(prefix))) continue

      const tags = this.tagsOf(item.id)
      if (anyTags && !tags.some((t) => anyTags.has(t.id))) continue
      if (allTags && ![...allTags].every((tid) => tags.some((t) => t.id === tid))) continue
      if (q.withoutTags && tags.length > 0) continue

      hits.push({ item, tags })
    }

    const dir = q.orderDir === 'desc' ? -1 : 1
    const order = q.order ?? 'createdAt'
    hits.sort((a, b) => {
      const va = orderValue(a.item, order)
      const vb = orderValue(b.item, order)
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0
    })

    const start = q.offset ?? 0
    const end = q.limit === undefined ? hits.length : start + q.limit
    return hits.slice(start, end)
  }

  // ---- 挂载 ---------------------------------------------------------------

  async attachTag(itemId: Id, tagId: Id): Promise<void> {
    this.requireItem(itemId)
    this.requireTag(tagId)
    const key = pairKey(itemId, tagId)
    if (this.state.attachments.has(key)) return
    this.state.attachments.set(key, { itemId, tagId })
  }

  async detachTag(itemId: Id, tagId: Id): Promise<void> {
    this.requireItem(itemId)
    this.requireTag(tagId)
    this.state.attachments.delete(pairKey(itemId, tagId))
  }

  async listAttachments(opts?: { itemId?: Id; tagId?: Id }): Promise<ItemAttach[]> {
    const out: ItemAttach[] = []
    for (const row of this.state.attachments.values()) {
      if (opts?.itemId !== undefined && row.itemId !== opts.itemId) continue
      if (opts?.tagId !== undefined && row.tagId !== opts.tagId) continue
      out.push(row)
    }
    return out
  }

  // ---- 标签关联 -----------------------------------------------------------

  async linkTag(fromId: Id, toId: Id): Promise<void> {
    if (fromId === toId) throw invalid('标签不能自关联')
    this.requireTag(fromId)
    this.requireTag(toId)
    const key = pairKey(fromId, toId)
    if (this.state.tagLinks.has(key)) return
    this.state.tagLinks.set(key, { from: fromId, to: toId })
  }

  async unlinkTag(fromId: Id, toId: Id): Promise<void> {
    this.requireTag(fromId)
    this.requireTag(toId)
    this.state.tagLinks.delete(pairKey(fromId, toId))
  }

  async listTagLinks(opts?: { from?: Id; to?: Id }): Promise<TagLink[]> {
    const out: TagLink[] = []
    for (const row of this.state.tagLinks.values()) {
      if (opts?.from !== undefined && row.from !== opts.from) continue
      if (opts?.to !== undefined && row.to !== opts.to) continue
      out.push(row)
    }
    return out
  }

  // ---- 声明 ---------------------------------------------------------------

  async declareTag(workspaceId: Id, tagId: Id): Promise<void> {
    this.requireWorkspace(workspaceId)
    this.requireTag(tagId)
    const key = pairKey(workspaceId, tagId)
    if (this.state.declarations.has(key)) return
    this.state.declarations.set(key, { workspaceId, tagId })
  }

  async undeclareTag(workspaceId: Id, tagId: Id): Promise<void> {
    this.requireWorkspace(workspaceId)
    this.requireTag(tagId)
    this.state.declarations.delete(pairKey(workspaceId, tagId))
  }

  async listDeclarations(opts?: { workspaceId?: Id; tagId?: Id }): Promise<Declaration[]> {
    const out: Declaration[] = []
    for (const row of this.state.declarations.values()) {
      if (opts?.workspaceId !== undefined && row.workspaceId !== opts.workspaceId) continue
      if (opts?.tagId !== undefined && row.tagId !== opts.tagId) continue
      out.push(row)
    }
    return out
  }

  // ---- 工作区 -------------------------------------------------------------

  async createWorkspace(input: NewWorkspace): Promise<Workspace> {
    if (this.state.workspaces.has(input.id)) throw conflict(`工作区 id 重复：${input.id}`)
    const ws: Workspace = { id: input.id, name: input.name, createdAt: input.createdAt }
    this.state.workspaces.set(ws.id, ws)
    return ws
  }

  async deleteWorkspace(id: Id): Promise<void> {
    if (!this.state.workspaces.delete(id)) throw notFound('工作区', id)
  }

  async getWorkspace(id: Id): Promise<Workspace | null> {
    return this.state.workspaces.get(id) ?? null
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return [...this.state.workspaces.values()].sort(byNameAsc)
  }

  // ---- 作品 ---------------------------------------------------------------

  async createCollection(input: NewCollection): Promise<Collection> {
    this.requireItem(input.anchorItemId)
    if (this.state.collections.has(input.id)) throw conflict(`作品 id 重复：${input.id}`)
    const collection: Collection = {
      id: input.id,
      name: input.name,
      anchorItemId: input.anchorItemId,
      createdAt: input.createdAt,
    }
    this.state.collections.set(collection.id, collection)
    return collection
  }

  async renameCollection(id: Id, name: string): Promise<void> {
    const old = this.state.collections.get(id)
    if (!old) throw notFound('作品', id)
    this.state.collections.set(id, { ...old, name })
  }

  async deleteCollection(id: Id): Promise<void> {
    if (!this.state.collections.delete(id)) throw notFound('作品', id)
  }

  async getCollection(id: Id): Promise<Collection | null> {
    return this.state.collections.get(id) ?? null
  }

  async listCollections(): Promise<Collection[]> {
    return [...this.state.collections.values()].sort(byNameAsc)
  }

  async appendCollectionMember(collectionId: Id, itemId: Id): Promise<void> {
    this.requireCollection(collectionId)
    this.requireItem(itemId)
    const key = pairKey(collectionId, itemId)
    if (this.state.collectionMembers.has(key)) return
    const max = this.membersOfCollection(collectionId).reduce((m, r) => Math.max(m, r.position), -1)
    this.state.collectionMembers.set(key, { collectionId, itemId, position: max + 1 })
  }

  async removeCollectionMember(collectionId: Id, itemId: Id): Promise<void> {
    this.requireCollection(collectionId)
    this.requireItem(itemId)
    const key = pairKey(collectionId, itemId)
    if (!this.state.collectionMembers.delete(key)) return
    // 压实位置
    const rows = this.membersOfCollection(collectionId).sort((a, b) => a.position - b.position)
    rows.forEach((row, i) => {
      if (row.position !== i) {
        this.state.collectionMembers.delete(pairKey(collectionId, row.itemId))
        this.state.collectionMembers.set(pairKey(collectionId, row.itemId), { ...row, position: i })
      }
    })
  }

  async reorderCollectionMembers(collectionId: Id, orderedItemIds: Id[]): Promise<void> {
    this.requireCollection(collectionId)
    const current = this.membersOfCollection(collectionId).map((r) => r.itemId)
    const sameSet =
      current.length === orderedItemIds.length &&
      new Set(orderedItemIds).size === orderedItemIds.length &&
      [...current].sort().join('\u0000') === [...orderedItemIds].sort().join('\u0000')
    if (!sameSet) throw invalid('重排必须恰好是当前成员集合的一个排列')
    // 整组重写位置
    for (const row of this.membersOfCollection(collectionId)) {
      this.state.collectionMembers.delete(pairKey(collectionId, row.itemId))
    }
    orderedItemIds.forEach((itemId, i) => {
      this.state.collectionMembers.set(pairKey(collectionId, itemId), {
        collectionId,
        itemId,
        position: i,
      })
    })
  }

  async listCollectionMemberships(opts?: {
    collectionId?: Id
    itemId?: Id
  }): Promise<CollectionMember[]> {
    const out: CollectionMember[] = []
    for (const row of this.state.collectionMembers.values()) {
      if (opts?.collectionId !== undefined && row.collectionId !== opts.collectionId) continue
      if (opts?.itemId !== undefined && row.itemId !== opts.itemId) continue
      out.push(row)
    }
    out.sort((a, b) => a.position - b.position)
    return out
  }

  // ---- 组 ---------------------------------------------------------------

  async createGroup(input: NewGroup): Promise<Group> {
    if (this.state.groups.has(input.id)) throw conflict(`组 id 重复：${input.id}`)
    const group: Group = { id: input.id, name: input.name, createdAt: input.createdAt }
    this.state.groups.set(group.id, group)
    return group
  }

  async renameGroup(id: Id, name: string): Promise<void> {
    const old = this.state.groups.get(id)
    if (!old) throw notFound('组', id)
    this.state.groups.set(id, { ...old, name })
  }

  async deleteGroup(id: Id): Promise<void> {
    if (!this.state.groups.delete(id)) throw notFound('组', id)
  }

  async getGroup(id: Id): Promise<Group | null> {
    return this.state.groups.get(id) ?? null
  }

  async listGroups(): Promise<Group[]> {
    return [...this.state.groups.values()].sort(byNameAsc)
  }

  async addGroupMember(groupId: Id, tagId: Id): Promise<void> {
    this.requireGroup(groupId)
    this.requireTag(tagId)
    const key = pairKey(groupId, tagId)
    if (this.state.groupMembers.has(key)) return
    this.state.groupMembers.set(key, { groupId, tagId })
  }

  async removeGroupMember(groupId: Id, tagId: Id): Promise<void> {
    this.requireGroup(groupId)
    this.requireTag(tagId)
    this.state.groupMembers.delete(pairKey(groupId, tagId))
  }

  async listGroupMemberships(opts?: { groupId?: Id; tagId?: Id }): Promise<GroupMember[]> {
    const out: GroupMember[] = []
    for (const row of this.state.groupMembers.values()) {
      if (opts?.groupId !== undefined && row.groupId !== opts.groupId) continue
      if (opts?.tagId !== undefined && row.tagId !== opts.tagId) continue
      out.push(row)
    }
    return out
  }

  // ---- 内部辅助 -----------------------------------------------------------

  private hasTagNamed(name: string): boolean {
    const target = name.toLowerCase()
    for (const tag of this.state.tags.values()) {
      if (tag.name.toLowerCase() === target) return true
    }
    return false
  }

  private tagsOf(itemId: Id): Tag[] {
    const out: Tag[] = []
    for (const row of this.state.attachments.values()) {
      if (row.itemId !== itemId) continue
      const tag = this.state.tags.get(row.tagId)
      if (tag) out.push(tag)
    }
    out.sort(byNameAsc)
    return out
  }

  private membersOfCollection(collectionId: Id): CollectionMember[] {
    const out: CollectionMember[] = []
    for (const row of this.state.collectionMembers.values()) {
      if (row.collectionId === collectionId) out.push(row)
    }
    return out
  }

  private requireTag(id: Id): void {
    if (!this.state.tags.has(id)) throw notFound('标签', id)
  }

  private requireItem(id: Id): void {
    if (!this.state.items.has(id)) throw notFound('条目', id)
  }

  private requireWorkspace(id: Id): void {
    if (!this.state.workspaces.has(id)) throw notFound('工作区', id)
  }

  private requireCollection(id: Id): void {
    if (!this.state.collections.has(id)) throw notFound('作品', id)
  }

  private requireGroup(id: Id): void {
    if (!this.state.groups.has(id)) throw notFound('组', id)
  }
}

/** 新建一个空的内存 Store（应用层/测试入口）。 */
export function createMemoryStore(): Store {
  return new MemoryStore()
}

/** 按字段取排序值；anchor 条目无 sourceUri，取空串参与排序。 */
function orderValue(item: Item, order: 'createdAt' | 'title' | 'sourceUri'): string {
  switch (order) {
    case 'createdAt':
      return item.createdAt
    case 'title':
      return item.title
    case 'sourceUri':
      return item.kind === 'file' ? item.sourceUri : ''
  }
}
