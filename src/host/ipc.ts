/**
 * 渲染层 ↔ 主进程的 IPC 契约：类型化的窄桥（HostApi 门面 v0）。
 *
 * 设计要点：
 * - 每个端点 = 一个应用层用例/读操作的窄封装，参数与结果全部类型化；
 * - 统一结果信封 Result<T>：成功 { ok:true, data } / 失败 { ok:false, error:{code,message} }
 *   ——D9 错误转译在此落地：DomainError.code 原样带出，渲染层只按 code 转文案；
 * - 渲染层**不直接触碰 Store**：所有读写都经这里路由到应用层用例，
 *   字节/文件/数据库永不进入渲染层；
 * - 本表是契约的**单一事实源**：新增端点在此加一行即获得两端类型；
 *   frontend 仅 type-only 引用本文件，零运行时依赖。
 *
 * v0 范围：已落地的应用层用例全覆盖。明确**不进**契约（旧 UI 对应处置灰）：
 * config、插件调用、原生 dialog、条目 readText/openWithSystem、
 * 标签关联语义、扫描进度事件（事件面随 D6 落地）。
 * 缩略图（thumbnail.save）为派生小图通道：仅收视频 canvas 抓帧 JPEG（≤2MiB），非原媒体字节。
 */

import type {
  Collection,
  DomainErrorCode,
  Group,
  Id,
  Item,
  ItemStatus,
  NodeState,
  PathNode,
  Tag,
  Workspace,
  WorkspaceRoot,
} from '../domain/index.ts'
import type { ItemHit, ItemsQuery } from '../ports/index.ts'
import type { ProjectedHit } from '../application/index.ts'
import type { ScanOptions, ScanSummary } from '../application/index.ts'

/** 渲染层常用形状随契约一并交付（frontend 经 shared/contract.ts type-only 引用）。 */
export type {
  Collection,
  Group,
  Id,
  Item,
  ItemHit,
  ItemsQuery,
  ItemStatus,
  NodeState,
  PathNode,
  ProjectedHit,
  ScanOptions,
  ScanSummary,
  Tag,
  Workspace,
  WorkspaceRoot,
}

export interface Ok<T> {
  ok: true
  data: T
}

export interface Err {
  ok: false
  error: { code: DomainErrorCode | 'UNKNOWN'; message: string }
}

export type Result<T> = Ok<T> | Err

/** 壳级窗口动作（无边框窗口的自绘控制键）。 */
export type WindowAction = 'minimize' | 'toggleMaximize' | 'close'

/** 端点契约：args → result。新增端点在此加一行即获得两端类型。 */
export interface IpcContracts {
  ping: { args: []; result: { version: string } }

  // ---- 标签 tag：建 / 查 / 删 / 声明 --------------------------------------
  'tags.search': { args: [text: string]; result: Tag[] }
  'tags.create': { args: [input: { name: string; description?: string | null }]; result: Tag }
  'tags.delete': { args: [tagId: Id]; result: null }
  'tags.declare': { args: [{ workspaceId: Id; tagId: Id }]; result: null }
  'tags.undeclare': { args: [{ workspaceId: Id; tagId: Id }]; result: null }

  // ---- 条目 item：查 / 打标 / 删 ------------------------------------------
  'items.query': { args: [query: ItemsQuery]; result: ItemHit[] }
  'item.tag': { args: [{ itemId: Id; tagIds: Id[] }]; result: null }
  'item.untag': { args: [{ itemId: Id; tagIds: Id[] }]; result: null }
  'items.tag': { args: [{ itemIds: Id[]; tagIds: Id[] }]; result: null }
  'items.untag': { args: [{ itemIds: Id[]; tagIds: Id[] }]; result: null }
  'items.delete': { args: [itemId: Id]; result: null }
  /** 文本条目内容（字节闸门）：不可文本预览 → null；截断由 truncated 标记 */
  'item.readText': { args: [itemId: Id, maxBytes?: number]; result: { text: string; truncated: boolean } | null }

  // ---- 缩略图 thumbnail：视频帧抓取结果落盘 + 回写（主进程能力，字节进闸门一次） ----
  /** base64 JPEG（渲染层 canvas 抓帧）→ 宿主落盘 {userData}/thumbnails/{contentHash}.jpg + 按哈希回写 */
  'thumbnail.save': {
    args: [{ contentHash: string; base64: string; width?: number | null; height?: number | null }]
    result: { previewUri: string }
  }

  // ---- 工作区 workspace：建 / 列 / 浏览 / 来源根 ---------------------------
  'workspace.create': { args: [name: string]; result: Workspace }
  'workspace.list': { args: []; result: Workspace[] }
  'workspace.get': { args: [workspaceId: Id]; result: Workspace | null }
  'workspace.browse': { args: [workspaceId: Id, query?: ItemsQuery]; result: ProjectedHit[] }
  'workspace.declaredTags': { args: [workspaceId: Id]; result: Id[] }
  'workspace.mountRoot': { args: [{ workspaceId: Id; path: string }]; result: null }
  'workspace.unmountRoot': { args: [{ workspaceId: Id; path: string }]; result: null }
  'workspace.listRoots': { args: [workspaceId: Id]; result: WorkspaceRoot[] }
  'workspace.delete': { args: [workspaceId: Id]; result: null }

  // ---- 扫描 scan：宿主注入真实文件系统 -------------------------------------
  'scan.run': { args: [workspaceId: Id, options?: ScanOptions]; result: ScanSummary }

  // ---- 作品 collection：有序成员 + 锚条目 ----------------------------------
  'collection.create': { args: [name: string]; result: Collection }
  'collection.rename': { args: [{ collectionId: Id; name: string }]; result: null }
  'collection.appendMember': { args: [{ collectionId: Id; itemId: Id }]; result: null }
  'collection.removeMember': { args: [{ collectionId: Id; itemId: Id }]; result: null }
  'collection.reorderMembers': { args: [{ collectionId: Id; orderedItemIds: Id[] }]; result: null }
  'collection.delete': { args: [collectionId: Id]; result: null }

  // ---- 组 group：组织标签的扁平容器 ----------------------------------------
  'group.create': { args: [name: string]; result: Group }
  'group.rename': { args: [{ groupId: Id; name: string }]; result: null }
  'group.addMember': { args: [{ groupId: Id; tagId: Id }]; result: null }
  'group.removeMember': { args: [{ groupId: Id; tagId: Id }]; result: null }
  'group.delete': { args: [groupId: Id]; result: null }

  // ---- 窗口 window：壳级控制（无边框窗口的自绘控制键；主进程能力，非业务用例） ----
  'window.control': { args: [action: WindowAction]; result: null }
  'window.isMaximized': { args: []; result: boolean }
}

export type IpcKind = keyof IpcContracts

export type IpcArgs<K extends IpcKind> = IpcContracts[K]['args']
export type IpcResult<K extends IpcKind> = Result<IpcContracts[K]['result']>

/** 渲染层通过 window.taghit 获得的面（preload 实现）。 */
export interface TaghitRendererApi {
  ping(): Promise<IpcResult<'ping'>>

  createTag(input: { name: string; description?: string | null }): Promise<IpcResult<'tags.create'>>
  searchTags(text: string): Promise<IpcResult<'tags.search'>>
  deleteTag(tagId: Id): Promise<IpcResult<'tags.delete'>>
  declareTag(input: { workspaceId: Id; tagId: Id }): Promise<IpcResult<'tags.declare'>>
  undeclareTag(input: { workspaceId: Id; tagId: Id }): Promise<IpcResult<'tags.undeclare'>>

  queryItems(query: ItemsQuery): Promise<IpcResult<'items.query'>>
  tagItem(input: { itemId: Id; tagIds: Id[] }): Promise<IpcResult<'item.tag'>>
  untagItem(input: { itemId: Id; tagIds: Id[] }): Promise<IpcResult<'item.untag'>>
  tagItems(input: { itemIds: Id[]; tagIds: Id[] }): Promise<IpcResult<'items.tag'>>
  untagItems(input: { itemIds: Id[]; tagIds: Id[] }): Promise<IpcResult<'items.untag'>>
  deleteItem(itemId: Id): Promise<IpcResult<'items.delete'>>
  readText(itemId: Id, maxBytes?: number): Promise<IpcResult<'item.readText'>>

  saveThumbnail(input: {
    contentHash: string
    base64: string
    width?: number | null
    height?: number | null
  }): Promise<IpcResult<'thumbnail.save'>>

  createWorkspace(name: string): Promise<IpcResult<'workspace.create'>>
  listWorkspaces(): Promise<IpcResult<'workspace.list'>>
  getWorkspace(workspaceId: Id): Promise<IpcResult<'workspace.get'>>
  browseWorkspace(workspaceId: Id, query?: ItemsQuery): Promise<IpcResult<'workspace.browse'>>
  declaredTags(workspaceId: Id): Promise<IpcResult<'workspace.declaredTags'>>
  mountRoot(input: { workspaceId: Id; path: string }): Promise<IpcResult<'workspace.mountRoot'>>
  unmountRoot(input: { workspaceId: Id; path: string }): Promise<IpcResult<'workspace.unmountRoot'>>
  listRoots(workspaceId: Id): Promise<IpcResult<'workspace.listRoots'>>
  deleteWorkspace(workspaceId: Id): Promise<IpcResult<'workspace.delete'>>

  runScan(workspaceId: Id, options?: ScanOptions): Promise<IpcResult<'scan.run'>>

  createCollection(name: string): Promise<IpcResult<'collection.create'>>
  renameCollection(input: { collectionId: Id; name: string }): Promise<IpcResult<'collection.rename'>>
  appendCollectionMember(input: { collectionId: Id; itemId: Id }): Promise<IpcResult<'collection.appendMember'>>
  removeCollectionMember(input: { collectionId: Id; itemId: Id }): Promise<IpcResult<'collection.removeMember'>>
  reorderCollectionMembers(input: { collectionId: Id; orderedItemIds: Id[] }): Promise<IpcResult<'collection.reorderMembers'>>
  deleteCollection(collectionId: Id): Promise<IpcResult<'collection.delete'>>

  createGroup(name: string): Promise<IpcResult<'group.create'>>
  renameGroup(input: { groupId: Id; name: string }): Promise<IpcResult<'group.rename'>>
  addGroupMember(input: { groupId: Id; tagId: Id }): Promise<IpcResult<'group.addMember'>>
  removeGroupMember(input: { groupId: Id; tagId: Id }): Promise<IpcResult<'group.removeMember'>>
  deleteGroup(groupId: Id): Promise<IpcResult<'group.delete'>>

  windowControl(action: WindowAction): Promise<IpcResult<'window.control'>>
  isWindowMaximized(): Promise<IpcResult<'window.isMaximized'>>
}
