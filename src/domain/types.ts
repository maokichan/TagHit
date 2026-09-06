/**
 * 领域类型（纯 TS）。实体与关系记录；行为在应用层，不在本层实现。
 */

export type Id = string

export type ItemStatus = 'active' | 'missing'

/** 素材条目：有内容来源（v1 = 本地文件路径）。 */
export interface FileItem {
  kind: 'file'
  id: Id
  title: string
  sourceUri: string
  contentHash: string | null
  size: number | null
  fileModifiedAt: string | null
  status: ItemStatus
  createdAt: string
}

/** 空条目·锚：无来源，承接作品标签；随作品创建与删除。 */
export interface AnchorItem {
  kind: 'anchor'
  id: Id
  title: string
  createdAt: string
}

export type Item = FileItem | AnchorItem

export interface Workspace {
  id: Id
  name: string
  createdAt: string
}

export interface Tag {
  id: Id
  name: string
  description: string | null
  createdAt: string
}

/** 作品/合集：有序成员 + 锚条目（标签面）。 */
export interface Collection {
  id: Id
  name: string
  anchorItemId: Id
  createdAt: string
}

/** 组：组织标签的扁平容器。 */
export interface Group {
  id: Id
  name: string
  createdAt: string
}

/** 标签关联：有向 tag → tag；语义由使用方组织。 */
export interface TagLink {
  from: Id
  to: Id
}

/** 挂载：条目 × 标签（条目级）。 */
export interface ItemAttach {
  itemId: Id
  tagId: Id
}

/** 声明：工作区 × 标签，读取端投影的事实。 */
export interface Declaration {
  workspaceId: Id
  tagId: Id
}

/** 成员：作品 → 条目（有序）。position 为成员在该作品内的 0 起位置。 */
export interface CollectionMember {
  collectionId: Id
  itemId: Id
  position: number
}

/** 成员：组 → 标签（无序）。 */
export interface GroupMember {
  groupId: Id
  tagId: Id
}

// ---------------------------------------------------------------------------
// 工作区 ↔ 来源路径（条目可见性派生模型；节点由扫描用例创建，未到首批）
// ---------------------------------------------------------------------------

/** 节点状态：仅作用于该节点的直接条目；不影响其子节点与父节点（不级联）。 */
export type NodeState = 'included' | 'excluded'

/**
 * 来源根：挂到工作区的目录路径（配置行）。
 * 工作区拥有其来源根集合，但**不拥有条目**。路径为归一化绝对路径（正斜杠）。
 */
export interface WorkspaceRoot {
  workspaceId: Id
  path: string
}

/**
 * 路径节点：扫描在某来源根下发现的目录（含来源根本身 = 根节点）。
 * 身份 = 工作区 × 目录路径；树形由目录路径的前缀关系蕴含（不另存父指针）。
 * 条目的节点归属**不落库**：浏览时以 sourceUri 的父目录 == dirPath 派生。
 */
export interface PathNode {
  workspaceId: Id
  dirPath: string
  state: NodeState
}

export function isFileItem(item: Item): item is FileItem {
  return item.kind === 'file'
}

export function isAnchorItem(item: Item): item is AnchorItem {
  return item.kind === 'anchor'
}
