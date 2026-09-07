import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@shared/api'
import { toItemView, type ItemView } from '../lib/viewModel'
import type { Id, ItemsQuery, ScanSummary } from '@shared/contract'

const PAGE_SIZE = 120

/** 排序键（ItemsQuery 白名单：createdAt/title/sourceUri）。 */
export type SortOrder = 'createdAt' | 'title' | 'sourceUri'

/**
 * 条目 store：当前工作区的浏览视图（成员派生 + 声明投影）+ 过滤 + 分页。
 * 数据流裁决：改意图 → 窄桥调一次用例 → 失效重查；不做本地过滤/排序。
 * 扫描进度事件未进契约 v0：扫描期间只显示整体进行态（scan.run 一次返回 Summary）。
 */
export const useItemStore = defineStore('item', () => {
  /** 投影后的条目视图（tags 已按工作区声明裁剪，hiddenCount 为未交付数） */
  const items = ref<ItemView[]>([])
  const loading = ref(false)
  const scanning = ref(false)
  const scanError = ref<string | null>(null)
  const lastScanResult = ref<ScanSummary | null>(null)
  /** 信息面板当前选中条目（工作区网格内单选） */
  const selected = ref<ItemView | null>(null)
  /** 多选集（Ctrl/Cmd+单击与右键聚合；批量打标/MenuContext.selection 的依据） */
  const selectedIds = ref<Id[]>([])

  const filter = ref<{ tagIds: Id[]; keyword: string }>({ tagIds: [], keyword: '' })

  // 分页：主界面一次最多渲染一页，滚动/按钮加载更多
  const page = ref(0)
  const hasMore = ref(false)

  // 排序（显示面板控制）
  const sortBy = ref<SortOrder>('createdAt')
  const sortDir = ref<'asc' | 'desc'>('desc')

  function buildQuery(offset: number): ItemsQuery {
    const query: ItemsQuery = { limit: PAGE_SIZE, offset }
    if (filter.value.tagIds.length) query.withAllTags = [...filter.value.tagIds]
    if (filter.value.keyword) query.titleContains = filter.value.keyword
    query.order = sortBy.value
    query.orderDir = sortDir.value
    return query
  }

  function toggleSortDir(): void {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }

  /** 重新加载（过滤/扫描变化时）：回到第一页并替换条目 */
  async function load(workspaceId: Id): Promise<void> {
    loading.value = true
    try {
      const hits = await api.workspaces.browse(workspaceId, buildQuery(0))
      items.value = hits.map(toItemView)
      page.value = 0
      hasMore.value = false // browse 端点单次返回成员集；分页待 ItemsQuery total 语义落地
    } finally {
      loading.value = false
    }
  }

  /** 加载下一页（追加到网格尾部）。当前 browse 一次返回全部成员，暂为 no-op。 */
  async function loadMore(workspaceId: Id): Promise<void> {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      const next = page.value + 1
      const hits = await api.workspaces.browse(workspaceId, buildQuery(next * PAGE_SIZE))
      items.value = [...items.value, ...hits.map(toItemView)]
      page.value = next
    } finally {
      loading.value = false
    }
  }

  async function scan(workspaceId: Id): Promise<void> {
    scanning.value = true
    scanError.value = null
    try {
      lastScanResult.value = await api.workspaces.scan(workspaceId)
      await load(workspaceId)
    } catch (e) {
      scanError.value = e instanceof Error ? e.message : String(e)
    } finally {
      scanning.value = false
    }
  }

  /** 选中条目（信息面板）。0.2 无 EAV 补全：选中即完整视图。单击 = 单选。 */
  function select(item: ItemView): void {
    selected.value = item
    selectedIds.value = [item.id]
  }

  /** Ctrl/Cmd+单击：切换条目进入/退出多选集；selected 跟随最后一次点击。 */
  function toggleSelect(item: ItemView): void {
    const has = selectedIds.value.includes(item.id)
    selectedIds.value = has
      ? selectedIds.value.filter((id) => id !== item.id)
      : [...selectedIds.value, item.id]
    if (selectedIds.value.length === 0) selected.value = null
    else selected.value = item
  }

  /** 是否在多选集内（ItemCard 勾选角标与右键 selection 投影用）。 */
  function isSelected(id: Id): boolean {
    return selectedIds.value.includes(id)
  }

  /** 多选集计数（右键/批量入口判断）。 */
  function selectionCount(): number {
    return selectedIds.value.length
  }

  function clearSelection(): void {
    selected.value = null
    selectedIds.value = []
  }

  /** 缩略图回写后就地更新视图（列表项 + 信息面板），避免整页重查。 */
  function patchItemThumbnail(
    itemId: Id,
    patch: { previewUri: string; width: number; height: number }
  ): void {
    const list = items.value
    const i = list.findIndex((it) => it.id === itemId)
    if (i >= 0) {
      list[i] = { ...list[i], ...patch }
      items.value = [...list]
    }
    if (selected.value?.id === itemId) {
      selected.value = { ...selected.value, ...patch }
    }
  }

  /** 批量打标：对多选集挂标签（单事务原子），完成后刷新当前工作区视图。 */
  async function tagSelected(workspaceId: Id, tagIds: Id[]): Promise<void> {
    await api.items.tagMany(selectionIdsInView(), tagIds)
    await load(workspaceId)
  }

  /** 批量卸标：对多选集卸标签，完成后刷新。 */
  async function untagSelected(workspaceId: Id, tagIds: Id[]): Promise<void> {
    await api.items.untagMany(selectionIdsInView(), tagIds)
    await load(workspaceId)
  }

  /** 多选集 ∩ 当前视图条目（过滤已离屏/删除的 id，避免批量命令对不存在的条目 NOT_FOUND）。 */
  function selectionIdsInView(): Id[] {
    const inView = new Set(items.value.map((it) => it.id))
    return selectedIds.value.filter((id) => inView.has(id))
  }

  function toggleTagFilter(tagId: Id): void {
    const list = filter.value.tagIds
    filter.value.tagIds = list.includes(tagId) ? list.filter((id) => id !== tagId) : [...list, tagId]
  }

  /** 清空全部标签筛选 */
  function clearTagFilters(): void {
    filter.value.tagIds = []
  }

  function setKeyword(kw: string): void {
    filter.value.keyword = kw
  }

  return {
    items,
    loading,
    scanning,
    scanError,
    lastScanResult,
    selected,
    selectedIds,
    filter,
    sortBy,
    sortDir,
    page,
    hasMore,
    load,
    loadMore,
    scan,
    select,
    toggleSelect,
    isSelected,
    selectionCount,
    clearSelection,
    patchItemThumbnail,
    tagSelected,
    untagSelected,
    toggleTagFilter,
    clearTagFilters,
    setKeyword,
    toggleSortDir
  }
})
