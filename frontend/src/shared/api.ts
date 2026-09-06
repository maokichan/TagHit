import type { AppConfig } from './types/config'
import type {
  AddPathRequest,
  ScanProgress,
  ScanRequest,
  ScanResult,
  WorkspaceWithPaths
} from './types/workspace'
import type { ItemFilter, ItemWithTags, UpdateTagsRequest } from './types/item'
import type { AddHierarchyRequest, CreateTagRequest, DeclareTagRequest, Tag, TagNode } from './types/tag'
import type { SearchRequest, SearchResult } from './types/search'
import type { PluginCallRequest, PluginInfo } from './types/plugin'
import type { EventChannel } from './ipc'

/**
 * 渲染进程可见的 API 形状（window.api）。
 * 由 preload 实现，@shared 单点定义，保证三端类型一致。
 */
export interface TaghitApi {
  workspace: {
    list(): Promise<WorkspaceWithPaths[]>
    create(title: string): Promise<WorkspaceWithPaths>
    update(id: number, title: string): Promise<WorkspaceWithPaths>
    remove(id: number): Promise<void>
    addPath(req: AddPathRequest): Promise<WorkspaceWithPaths>
    removePath(pathId: number, workspaceId: number): Promise<WorkspaceWithPaths>
    scan(req: ScanRequest): Promise<ScanResult>
    /** 设置工作区封面（null = 自动取工作区内图片） */
    setCover(id: number, coverPath: string | null): Promise<WorkspaceWithPaths>
  }
  item: {
    list(filter: ItemFilter): Promise<{ items: ItemWithTags[]; total: number }>
    get(id: number, workspaceId: number): Promise<ItemWithTags | null>
    updateTags(req: UpdateTagsRequest): Promise<ItemWithTags | null>
    /** 读取文本条目内容（L2 文本预览；非文本/超限返回 null） */
    readText(itemId: number): Promise<{ text: string } | null>
    /** 用系统关联应用打开条目（L0/L1 兜底） */
    openWithSystem(itemId: number): Promise<void>
    /** 可用排序键（排序白名单单一事实来源在 ItemService，渲染层驱动式渲染下拉） */
    listSortKeys(): Promise<Array<{ key: string; label: string }>>
  }
  tag: {
    list(): Promise<Tag[]>
    listWithRelations(): Promise<TagNode[]>
    /** 某工作区已声明的标签 */
    listForWorkspace(workspaceId: number): Promise<Tag[]>
    create(req: CreateTagRequest): Promise<Tag>
    update(id: number, patch: { name?: string; description?: string }): Promise<Tag>
    remove(id: number): Promise<void>
    addHierarchy(req: AddHierarchyRequest): Promise<void>
    removeHierarchy(parentId: number, childId: number): Promise<void>
    /** 在某工作区声明一个全局标签（仅改变可见性） */
    declare(req: DeclareTagRequest): Promise<void>
    undeclare(req: DeclareTagRequest): Promise<void>
  }
  search: {
    /** 工作区内搜索（仅匹配已声明标签） */
    query(req: SearchRequest): Promise<SearchResult>
    /** 全局搜索（开始界面，跨工作区） */
    global(req: SearchRequest): Promise<SearchResult>
  }
  config: {
    get(): Promise<AppConfig>
    update(patch: Partial<AppConfig>): Promise<AppConfig>
  }
  plugin: {
    list(): Promise<PluginInfo[]>
    call(req: PluginCallRequest): Promise<unknown>
  }
  dialog: {
    /** 原生目录选择器，取消返回 null */
    pickFolder(): Promise<string | null>
    /** 原生图片选择器（工作区封面用），取消返回 null */
    pickImage(): Promise<string | null>
    /** 原生确认框（确定/取消），返回是否确认 */
    confirm(options: { title?: string; message: string }): Promise<boolean>
  }
  thumbnail: {
    /** 保存渲染进程生成的缩略图（base64 JPEG），回写 item.preview_uri，返回缓存路径 */
    save(req: { contentHash: string; base64: string }): Promise<string | null>
  }
  /** 订阅主进程事件（扫描进度 / 插件事件），返回取消订阅函数 */
  on(channel: EventChannel, cb: (payload: unknown) => void): () => void
}

export type ScanProgressHandler = (progress: ScanProgress) => void
