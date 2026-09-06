/**
 * 存储端口：应用层对外部存储的「需求清单」（被驱动端口，边界 B）。
 *
 * 端口契约的第一公民是「流动数据的类型」，其次才是适配器必须兑现的薄存取动词：
 * - 实体与关系行记录属于领域类型（src/domain/types.ts，纯数据，无行为）——
 *   它们是跨边界往返的负载，两端必须逐字节一致；
 * - 本文件只声明「跨边界输入/输出」的形状：写输入（New… 与 patch）、读契约
 *   （ItemsQuery / TagsQuery）、结果（ItemHit 等）；
 * - 动词是这些类型的进出通道：不做业务判定（规则在 rules.ts，流程在应用层用例），
 *   语义只做最小承诺，见下方「全局约定」。
 *
 * 全局约定（所有方法统一，不逐条重复；适配器一律遵守，否则不构成实现）：
 * - 异步边界：全端口 Promise。领域层保持同步纯函数（DECISIONS D4）。
 * - 事务：transaction(fn) 是「原子性」能力本身——fn 抛错则整体回滚、无部分写入；
 *   fn 收到同一事务作用域的 Store（顶层单条读写 = 适配器各开短事务）；
 *   不支持嵌套 transaction。跨多行的业务一致（删除级联等）由应用层用例编排，
 *   端口只负责「要么全部、要么没有」。
 * - 实体写：目标实体不存在 → NOT_FOUND；破坏唯一约束 → CONFLICT；
 *   破坏行结构不变量 → INVALID（码值见 domain/errors.ts）。
 * - 关系写幂等：重复 add、移除不存在的行，均为 no-op（集合语义）。
 * - 读宽松：条件引用不存在的 id 只不命中，不抛错。
 */

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
} from '../domain'

// ---------------------------------------------------------------------------
// 写输入（跨边界输入的形状；id / createdAt 由应用层经 Clock / IdGen 注入）
// ---------------------------------------------------------------------------

export interface NewTag {
  id: Id
  name: string
  description?: string | null
  createdAt: string
}

export interface NewWorkspace {
  id: Id
  name: string
  createdAt: string
}

export interface NewCollection {
  id: Id
  name: string
  /** 空条目·锚（承接作品标签）；须先建锚条目再建作品。 */
  anchorItemId: Id
  createdAt: string
}

export interface NewGroup {
  id: Id
  name: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// 读契约（可扩展的条件对象：全部字段可选，未给 = 不过滤；随真实查询补字段）
// ---------------------------------------------------------------------------

export interface TagsQuery {
  ids?: Id[]
  /** 名称子串过滤（不区分大小写）。 */
  nameContains?: string
}

export type ItemOrderField = 'createdAt' | 'title' | 'sourceUri'

export interface ItemsQuery {
  ids?: Id[]
  kinds?: Item['kind'][]
  /** 仅对 file 条目生效。 */
  status?: ItemStatus
  titleContains?: string
  /** sourceUri 前缀（大小写敏感，路径语义）；仅命中 file 条目。 */
  sourceUriPrefix?: string
  /** 命中任一挂载标签。 */
  withAnyTag?: Id[]
  /** 命中全部挂载标签。 */
  withAllTags?: Id[]
  /** 未挂任何标签。 */
  withoutTags?: boolean
  order?: ItemOrderField
  orderDir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// 结果（跨边界输出的形状）
// ---------------------------------------------------------------------------

/** 条目 + 其全部挂载标签（不按工作区投影——投影是应用层行为）。tags 按名升序。 */
export interface ItemHit {
  item: Item
  tags: Tag[]
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface Store {
  /**
   * 在单个事务里执行 fn(tx)。tx 与本 Store 同形，但作用域为该事务：
   * 事务内可读到自身未提交写入；fn 抛错 → 回滚并向上传播。
   */
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>

  // ---- 标签 tag ----------------------------------------------------------

  /** 新建标签。空名（trim 后）→ INVALID；名字大小写不敏感重复 → CONFLICT。返回创建实体。 */
  createTag(input: NewTag): Promise<Tag>

  /** 改描述（name 不变；改名需求出现时在 patch 上扩展）。不存在 → NOT_FOUND。 */
  updateTag(id: Id, patch: { description?: string | null }): Promise<void>

  /** 删标签行。挂载/关联/声明/组成员行的级联删除是应用层用例，同一事务内完成。 */
  deleteTag(id: Id): Promise<void>

  getTag(id: Id): Promise<Tag | null>

  /** 按名查找；语义与 rules.findTagNamed 一致（trim + 小写）。 */
  findTagByName(name: string): Promise<Tag | null>

  /** 条件查标签；空条件 = 全部，按名升序。 */
  queryTags(q?: TagsQuery): Promise<Tag[]>

  // ---- 条目 item ---------------------------------------------------------

  /** 新建条目（file 或 anchor）。id 重复 → CONFLICT。返回创建实体。 */
  createItem(item: Item): Promise<Item>

  /** 局部更新（title / 状态；其余如哈希、大小、修改时间待扫描用例扩展）。不存在 → NOT_FOUND。 */
  updateItem(id: Id, patch: { title?: string; status?: ItemStatus }): Promise<void>

  /** 删条目行。挂载/成员行的级联删除是应用层用例。 */
  deleteItem(id: Id): Promise<void>

  getItem(id: Id): Promise<Item | null>

  /** 条件查条目；空条件 = 全部。默认 createdAt 升序（同值按 id 稳定）。 */
  queryItems(q: ItemsQuery): Promise<ItemHit[]>

  // ---- 挂载：条目 × 标签（条目级；关系记录 ItemAttach） ------------------

  /** 打标。两端须存在（否则 NOT_FOUND）；已挂 → no-op。 */
  attachTag(itemId: Id, tagId: Id): Promise<void>

  /** 卸标。行不存在 → no-op；端点实体不存在 → NOT_FOUND。 */
  detachTag(itemId: Id, tagId: Id): Promise<void>

  /** 挂载行查询（删除级联反查用）。可按 itemId / tagId 过滤。 */
  listAttachments(opts?: { itemId?: Id; tagId?: Id }): Promise<ItemAttach[]>

  // ---- 标签关联：有向 tag → tag（语义由使用方组织，领域不解义） ----------

  /** 建关联。自环 → INVALID；同向已存在 → no-op；端点不存在 → NOT_FOUND。 */
  linkTag(fromId: Id, toId: Id): Promise<void>

  /** 拆关联。行不存在 → no-op；端点实体不存在 → NOT_FOUND。 */
  unlinkTag(fromId: Id, toId: Id): Promise<void>

  /** 关联行查询。可按 from / to 过滤。 */
  listTagLinks(opts?: { from?: Id; to?: Id }): Promise<TagLink[]>

  // ---- 声明：工作区 × 标签（读取端投影的事实） ---------------------------

  /** 声明。两端须存在（否则 NOT_FOUND）；已声明 → no-op。 */
  declareTag(workspaceId: Id, tagId: Id): Promise<void>

  /** 撤销声明。行不存在 → no-op；端点实体不存在 → NOT_FOUND。 */
  undeclareTag(workspaceId: Id, tagId: Id): Promise<void>

  /** 声明行查询（投影与删除级联反查用）。可按 workspaceId / tagId 过滤。 */
  listDeclarations(opts?: { workspaceId?: Id; tagId?: Id }): Promise<Declaration[]>

  // ---- 工作区 workspace ---------------------------------------------------

  /** 返回创建的工作区。名称允许重复，身份由 id 区分。 */
  createWorkspace(input: NewWorkspace): Promise<Workspace>

  /** 删工作区行；其声明的级联删除是应用层用例。 */
  deleteWorkspace(id: Id): Promise<void>

  getWorkspace(id: Id): Promise<Workspace | null>

  /** 全部工作区，按名升序。 */
  listWorkspaces(): Promise<Workspace[]>

  // ---- 作品 collection（有序成员 + 锚条目承载标签） -----------------------

  /** 锚条目须已存在（否则 NOT_FOUND）。返回创建实体。 */
  createCollection(input: NewCollection): Promise<Collection>

  renameCollection(id: Id, name: string): Promise<void>

  /** 删作品行；成员与锚条目的级联删除是应用层用例（删除级联）。 */
  deleteCollection(id: Id): Promise<void>

  getCollection(id: Id): Promise<Collection | null>

  /** 全部作品，按名升序。 */
  listCollections(): Promise<Collection[]>

  /** 末尾追加成员（position 递增）。已在该作品 → no-op；端点不存在 → NOT_FOUND。 */
  appendCollectionMember(collectionId: Id, itemId: Id): Promise<void>

  /** 移除成员并压实位置。行不存在 → no-op；端点实体不存在 → NOT_FOUND。 */
  removeCollectionMember(collectionId: Id, itemId: Id): Promise<void>

  /**
   * 整体重排：orderedItemIds 必须是当前成员集合的一个排列（集合相同），
   * 否则 → INVALID（防静默丢成员）。collection 不存在 → NOT_FOUND。
   */
  reorderCollectionMembers(collectionId: Id, orderedItemIds: Id[]): Promise<void>

  /** 成员行查询，按 position 升序。可按 collectionId / itemId 过滤。 */
  listCollectionMemberships(opts?: { collectionId?: Id; itemId?: Id }): Promise<CollectionMember[]>

  // ---- 组 group（组织标签的扁平容器；成员无序） ---------------------------

  createGroup(input: NewGroup): Promise<Group>

  renameGroup(id: Id, name: string): Promise<void>

  /** 删组行；其成员行的级联删除是应用层用例。 */
  deleteGroup(id: Id): Promise<void>

  getGroup(id: Id): Promise<Group | null>

  /** 全部组，按名升序。 */
  listGroups(): Promise<Group[]>

  /** 加成员。端点不存在 → NOT_FOUND；已加入 → no-op。 */
  addGroupMember(groupId: Id, tagId: Id): Promise<void>

  /** 移除成员。行不存在 → no-op；端点实体不存在 → NOT_FOUND。 */
  removeGroupMember(groupId: Id, tagId: Id): Promise<void>

  /** 成员行查询。可按 groupId / tagId 过滤。 */
  listGroupMemberships(opts?: { groupId?: Id; tagId?: Id }): Promise<GroupMember[]>
}
