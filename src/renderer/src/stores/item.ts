import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ItemWithTags, ItemFilter } from '@shared/types/item'
import type { ScanProgress, ScanResult } from '@shared/types/workspace'

const PAGE_SIZE = 120

/**
 * 条目 store：当前标签页（工作区）的网格数据 + 过滤 + 扫描状态 + 分页。
 * 扫描进度事件在 App.vue 订阅后写入 scanProgress。
 */
export const useItemStore = defineStore('item', () => {
  const items = ref<ItemWithTags[]>([])
  const total = ref(0)
  const loading = ref(false)
  const scanning = ref(false)
  const scanProgress = ref<ScanProgress | null>(null)
  const scanError = ref<string | null>(null)
  const lastScanResult = ref<{
    added: number
    updated: number
    missing: number
    detached: number
    durationMs: number
  } | null>(null)
  /** 右侧信息面板当前选中的条目（工作区网格内单选） */
  const selected = ref<ItemWithTags | null>(null)

  const filter = ref<{ tagIds: number[]; mediaType: string; keyword: string }>({
    tagIds: [],
    mediaType: '',
    keyword: ''
  })

  // 分页：主界面一次最多渲染一页，滚动/按钮加载更多（修复"内容在库但显示不下"）
  const page = ref(0)
  const hasMore = ref(false)

  // 排序（显示面板控制）
  const sortBy = ref<string>('updatedAt')
  const sortDir = ref<'asc' | 'desc'>('desc')

  function buildFilter(workspaceId: number, offset: number): ItemFilter {
    const payload: ItemFilter = { workspaceId, limit: PAGE_SIZE, offset }
    if (filter.value.tagIds.length) payload.tagIds = [...filter.value.tagIds]
    if (filter.value.mediaType) payload.mediaType = filter.value.mediaType
    if (filter.value.keyword) payload.keyword = filter.value.keyword
    payload.sortBy = sortBy.value
    payload.sortDir = sortDir.value
    return payload
  }

  function toggleSortDir(): void {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }

  /** 重新加载（过滤/扫描变化时）：回到第一页并替换条目 */
  async function load(workspaceId: number): Promise<void> {
    loading.value = true
    try {
      const res = await window.api.item.list(buildFilter(workspaceId, 0))
      items.value = res.items
      total.value = res.total
      page.value = 0
      hasMore.value = items.value.length < res.total
    } finally {
      loading.value = false
    }
  }

  /** 加载下一页（追加到网格尾部） */
  async function loadMore(workspaceId: number): Promise<void> {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      const next = page.value + 1
      const res = await window.api.item.list(buildFilter(workspaceId, next * PAGE_SIZE))
      items.value = [...items.value, ...res.items]
      total.value = res.total
      page.value = next
      hasMore.value = items.value.length < res.total
    } finally {
      loading.value = false
    }
  }

  async function scan(workspaceId: number): Promise<void> {
    scanning.value = true
    scanError.value = null
    scanProgress.value = { workspaceId, phase: 'walk', processed: 0, total: 0, current: null }
    try {
      const result: ScanResult = await window.api.workspace.scan({ workspaceId })
      lastScanResult.value = {
        added: result.filesAdded,
        updated: result.filesUpdated,
        missing: result.filesMarkedMissing,
        detached: result.filesDetached,
        durationMs: result.durationMs
      }
      await load(workspaceId)
    } catch (e) {
      scanError.value = e instanceof Error ? e.message : String(e)
    } finally {
      scanning.value = false
      scanProgress.value = null
    }
  }

  /** 选中条目：立即显示，并异步补全元数据（EAV）供信息面板展示 */
  async function select(item: ItemWithTags, workspaceId: number): Promise<void> {
    selected.value = item
    const full = await window.api.item.get(item.id, workspaceId)
    if (full != null && selected.value?.id === item.id) {
      selected.value = full
    }
  }

  function clearSelection(): void {
    selected.value = null
  }

  /** 缩略图生成完成后回写（就地更新，触发网格重渲染） */
  function patchPreview(itemId: number, previewUri: string): void {
    const it = items.value.find((i) => i.id === itemId)
    if (it) it.previewUri = previewUri
    if (selected.value?.id === itemId) selected.value.previewUri = previewUri
  }

  function toggleTagFilter(tagId: number): void {
    const list = filter.value.tagIds
    filter.value.tagIds = list.includes(tagId) ? list.filter((id) => id !== tagId) : [...list, tagId]
  }

  function setKeyword(kw: string): void {
    filter.value.keyword = kw
  }

  function setMediaType(mt: string): void {
    filter.value.mediaType = filter.value.mediaType === mt ? '' : mt
  }

  return {
    items,
    total,
    loading,
    scanning,
    scanProgress,
    scanError,
    lastScanResult,
    selected,
    filter,
    sortBy,
    sortDir,
    page,
    hasMore,
    load,
    loadMore,
    scan,
    select,
    clearSelection,
    patchPreview,
    toggleTagFilter,
    setKeyword,
    setMediaType,
    toggleSortDir
  }
})
