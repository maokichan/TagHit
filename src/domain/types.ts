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

/** 标签关联：有向 tag → tag；语义由使用方组织（v1 按 is-a：子→父）。 */
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

export function isFileItem(item: Item): item is FileItem {
  return item.kind === 'file'
}

export function isAnchorItem(item: Item): item is AnchorItem {
  return item.kind === 'anchor'
}
