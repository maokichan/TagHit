import type { AppDb } from '../../db/connection'
import type { ConfigService } from '../config'
import type { EmitFn } from '../../events'
import { tagDao } from '../tag/tag.dao'
import { itemDao } from './item.dao'
import { isThumbPath } from '../thumbnail/thumbnail.service'
import { statSync, readFileSync } from 'fs'
import { shell } from 'electron'
import { logger } from '../logger'
import type { Item, ItemFilter, ItemMetadata, ItemWithTags } from '@shared/types/item'
import type { Tag } from '@shared/types/tag'

/** 文本可读扩展名（官方功能：L2 静态预览，随 fileFormatMap document 类扩展） */
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'ts', 'jsx', 'tsx',
  'css', 'html', 'htm', 'xml', 'yml', 'yaml', 'ini', 'log', 'csv', 'mjs', 'cjs'
])
/** 文本读取大小上限（防大文件整读卡主进程） */
const TEXT_MAX_BYTES = 2 * 1024 * 1024

/**
 * 排序键注册表 —— 排序业务规则的单一事实来源（RFC §5.7）。
 * 键 → SQL 安全列名（防注入白名单），渲染层从此处查询可用键，不再各自硬编码。
 */
export const SORT_KEYS = ['updatedAt', 'name', 'size', 'modifiedAt', 'addedAt', 'type'] as const
export type SortKey = (typeof SORT_KEYS)[number]

const SORT_COLUMNS: Record<SortKey, string> = {
  updatedAt: 'i.updated_at',
  name: 'i.title',
  size: 'i.size',
  modifiedAt: 'i.file_modified_at',
  addedAt: 'i.created_at',
  type: 'i.extension'
}

const SORT_LABELS: Record<SortKey, string> = {
  updatedAt: '最近更新',
  name: '名称',
  size: '大小',
  modifiedAt: '修改时间',
  addedAt: '添加时间',
  type: '类型'
}

/**
 * ItemService —— 条目域业务规则唯一归属（P0.5 收拢）。
 * 收拢来源：ipc/item.ts（声明校验）、item.dao.ts（排序白名单/格式映射/原图策略）。
 * 与 IPC handler / 未来插件桥共享同一实例：规则一致、事件同源。
 */
export class ItemService {
  constructor(
    private readonly db: AppDb,
    private readonly config: ConfigService,
    private readonly emit: EmitFn
  ) {}

  /** 可用排序键（渲染层驱动式渲染排序下拉，不再硬编码） */
  listSortKeys(): { key: SortKey; label: string }[] {
    return SORT_KEYS.map((k) => ({ key: k, label: SORT_LABELS[k] }))
  }

  /** 解析排序键 → 安全列名（非法/缺省回退默认 updatedAt） */
  private resolveOrderBy(sortBy: string | undefined): string {
    return (sortBy && (SORT_COLUMNS as Record<string, string>)[sortBy]) || SORT_COLUMNS.updatedAt
  }

  /** 媒体类别 → 扩展名列表（业务映射：config.fileFormatMap 换算，DAO 不再接收 config） */
  private extListFor(mediaType: string | undefined): string[] | undefined {
    if (!mediaType) return undefined
    const cfg = this.config.get()
    const exts = Object.entries(cfg.fileFormatMap)
      .filter(([, v]) => v === mediaType)
      .map(([k]) => k)
    return exts.length > 0 ? exts : undefined
  }

  /** 组装 ItemWithTags：媒体类型补全 + 原图策略（非缩略图路径 → null）+ 标签 + 宽高 */
  private assemble(
    item: Item,
    tags: Tag[],
    dims: Map<number, { width: number | null; height: number | null }> | null = null
  ): ItemWithTags {
    const cfg = this.config.get()
    const mediaType = item.extension ? cfg.fileFormatMap[item.extension.toLowerCase()] ?? 'other' : 'other'
    return {
      ...item,
      mediaType,
      tags,
      width: dims?.get(item.id)?.width ?? null,
      height: dims?.get(item.id)?.height ?? null,
      // 仅暴露缩略图路径；原图直出 → null（渲染层懒生成缩略图，避免全分辨率解码）
      previewUri: isThumbPath(item.previewUri) ? item.previewUri : null
    }
  }

  list(filter: ItemFilter): { items: ItemWithTags[]; total: number } {
    const { items, total } = itemDao.list(this.db, {
      workspaceId: filter.workspaceId,
      tagIds: filter.tagIds,
      extList: this.extListFor(filter.mediaType),
      keyword: filter.keyword,
      status: filter.status,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      orderBy: this.resolveOrderBy(filter.sortBy),
      orderDir: filter.sortDir ?? 'desc',
      limit: filter.limit ?? 200,
      offset: filter.offset ?? 0
    })
    const tagMap = itemDao.loadTags(this.db, filter.workspaceId, items.map((i) => i.id))
    const dims = itemDao.loadDims(this.db, items.map((i) => i.id))
    return {
      items: items.map((i) => this.assemble(i, tagMap.get(i.id) ?? [], dims)),
      total
    }
  }

  /** 全局搜索（跨工作区）：结果附带条目所属工作区（详情上下文） */
  listGlobal(
    filter: Omit<ItemFilter, 'workspaceId'> & { workspaceId?: number }
  ): { items: ItemWithTags[]; total: number } {
    const { items, total, workspaceIds } = itemDao.listGlobal(this.db, {
      tagIds: filter.tagIds,
      extList: this.extListFor(filter.mediaType),
      keyword: filter.keyword,
      status: filter.status,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      orderBy: this.resolveOrderBy(filter.sortBy),
      orderDir: filter.sortDir ?? 'desc',
      limit: filter.limit ?? 200,
      offset: filter.offset ?? 0
    })
    const tagMap = itemDao.loadTagsGlobal(this.db, items.map((i) => i.id))
    const dims = itemDao.loadDims(this.db, items.map((i) => i.id))
    return {
      items: items.map((i) => ({
        ...this.assemble(i, tagMap.get(i.id) ?? [], dims),
        workspaceIds: workspaceIds.get(i.id) ?? []
      })),
      total
    }
  }

  get(id: number, workspaceId: number): ItemWithTags | null {
    const item = itemDao.getById(this.db, id)
    if (!item) return null
    const tags = itemDao.loadTags(this.db, workspaceId, [id]).get(id) ?? []
    const metadata = itemDao.listMetadata(this.db, id)
    return { ...this.assemble(item, tags), metadata }
  }

  getMetadata(itemId: number): ItemMetadata[] {
    return itemDao.listMetadata(this.db, itemId)
  }

  /**
   * 打标/去标：声明校验（add 的每个标签必须已声明到该工作区）→ 写库 → 发事件。
   * 规则来源：原 ipc/item.ts（P0.5 收拢），插件桥与 IPC 共享本方法，无特权旁路。
   */
  updateTags(workspaceId: number, itemId: number, addTagIds: number[], removeTagIds: number[]): void {
    for (const tagId of addTagIds) {
      if (!tagDao.isDeclared(this.db, workspaceId, tagId)) {
        throw new Error('该标签未在当前工作区声明，无法挂载')
      }
    }
    itemDao.updateTags(this.db, workspaceId, itemId, addTagIds, removeTagIds)
    this.emit('item:tagsChanged', { itemId, workspaceId })
  }

  /**
   * 读取文本条目内容（官方功能：L2 文本预览）。
   * 规则：仅 TEXT_EXTS 扩展名 + 大小 ≤ TEXT_MAX_BYTES；返回 null 表示不可文本预览。
   */
  readText(itemId: number): { text: string } | null {
    const item = itemDao.getById(this.db, itemId)
    if (!item?.sourceUri) return null
    const ext = item.extension?.toLowerCase() ?? ''
    if (!TEXT_EXTS.has(ext)) return null
    try {
      if (statSync(item.sourceUri).size > TEXT_MAX_BYTES) return null
      return { text: readFileSync(item.sourceUri, 'utf-8') }
    } catch (err) {
      logger.warn('item', `readText 失败: ${item.sourceUri}`, err instanceof Error ? err.message : err)
      return null
    }
  }

  /** 用系统关联应用打开条目（官方功能：L0/L1 预览兜底，组织归 TagHit、打开归系统） */
  async openWithSystem(itemId: number): Promise<void> {
    const item = itemDao.getById(this.db, itemId)
    if (!item?.sourceUri) throw new Error('条目没有可打开的文件路径')
    const err = await shell.openPath(item.sourceUri)
    if (err) {
      logger.error('item', `openWithSystem 失败: ${item.sourceUri}`, err)
      throw new Error(`无法用系统应用打开: ${err}`)
    }
  }
}
