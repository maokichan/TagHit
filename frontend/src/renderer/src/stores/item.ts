import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@shared/api'
import { toItemView, type ItemView } from '../lib/viewModel'
import { extensionsFor, FILTERABLE_MEDIA_TYPES, type FilterableMediaType } from '../lib/mediaTypes'
import type { SelectIntent } from '../features/selection'
import type { Id, ItemContext, ItemsQuery, ScanSummary } from '@shared/contract'

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
  /** 区间选择锚点（上次 replace/toggle 落在视图中的下标）；清空选择即复位。 */
  const anchorIndex = ref<number | null>(null)

  /** 视图筛选：标签（必须含有，与语义）、排除标签（`-` 语法，挂任一即排除）、关键字、格式（类别折叠成扩展名集合下推，D36）、无标签。 */
  const filter = ref<{
    tagIds: Id[]
    excludedTagIds: Id[]
    keyword: string
    mediaTypes: FilterableMediaType[]
    untaggedOnly: boolean
  }>({
    tagIds: [],
    excludedTagIds: [],
    keyword: '',
    mediaTypes: [],
    untaggedOnly: false
  })

  /** 目录范围（视图状态）：只看该目录子树；null = 不限。下推为查询的 underDirPath。 */
  const scopeDirPath = ref<string | null>(null)

  // 分页：主界面一次最多渲染一页，滚动/按钮加载更多
  const page = ref(0)
  const hasMore = ref(false)
  /** 成员总数（不受分页影响）——条目数的唯一可信来源。 */
  const total = ref(0)
  /** 当前视图属于哪个工作区（信息面板据此定位"这个选中条目是从哪来的"）。 */
  const viewWorkspaceId = ref<Id | null>(null)

  // 排序（显示面板控制）
  const sortBy = ref<SortOrder>('createdAt')
  const sortDir = ref<'asc' | 'desc'>('desc')

  /** 最近一次视图加载的签名（就地刷新只在签名未变时可用：条件变了必须整页重查）。 */
  const viewSig = ref<string | null>(null)

  /** 当前视图条件的签名（滚动记忆与免重查判断的键）。 */
  function viewSignature(): string {
    const f = filter.value
    return JSON.stringify([
      f.tagIds,
      f.excludedTagIds,
      f.keyword,
      f.mediaTypes,
      f.untaggedOnly,
      scopeDirPath.value,
      sortBy.value,
      sortDir.value
    ])
  }

  function buildQuery(offset: number): ItemsQuery {
    const query: ItemsQuery = { limit: PAGE_SIZE, offset }
    if (filter.value.tagIds.length) query.withAllTags = [...filter.value.tagIds]
    if (filter.value.excludedTagIds.length) query.withoutAnyTag = [...filter.value.excludedTagIds]
    if (filter.value.keyword) query.titleContains = filter.value.keyword
    if (scopeDirPath.value != null) query.underDirPath = scopeDirPath.value
    if (filter.value.mediaTypes.length) query.extensions = extensionsFor(filter.value.mediaTypes)
    if (filter.value.untaggedOnly) query.withoutTags = true
    query.order = sortBy.value
    query.orderDir = sortDir.value
    return query
  }

  function toggleSortDir(): void {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }

  /** 重新加载（过滤/排序/范围/扫描变化时）：回到第一页并替换条目。 */
  async function load(workspaceId: Id): Promise<void> {
    loading.value = true
    try {
      // 换了工作区 → 多选集与"选中条目"属于上一个视图，先清掉：
      // 否则信息面板会继续显示别的库的条目，从那里打开详情还会得到一个不属于本视图的序列
      if (viewWorkspaceId.value !== workspaceId) {
        clearSelection()
        viewWorkspaceId.value = workspaceId
      }
      const sig = viewSignature() // 签名在查询前取：描述"这批数据是什么条件下取的"
      const res = await api.workspaces.browse(workspaceId, buildQuery(0))
      items.value = res.items.map(toItemView)
      total.value = res.total
      page.value = 0
      hasMore.value = items.value.length < res.total
      viewSig.value = sig
    } finally {
      loading.value = false
    }
  }

  /**
   * 就地刷新（回到工作区标签时）：视图条件未变 → 不回第一页、不亮"加载中"——
   * 按已加载的量重取一遍（吃进打标等带外操作的数据变化），滚动位置与分页深度都保住。
   * 工作区对不上或视图为空 → 退回整页 load（首次进入的常态路径）。
   */
  async function refreshInPlace(workspaceId: Id): Promise<void> {
    if (viewWorkspaceId.value !== workspaceId || items.value.length === 0) {
      await load(workspaceId)
      return
    }
    const sig = viewSignature()
    const query = buildQuery(0)
    query.limit = Math.max(items.value.length, PAGE_SIZE)
    const res = await api.workspaces.browse(workspaceId, query)
    items.value = res.items.map(toItemView)
    total.value = res.total
    page.value = Math.max(0, Math.ceil(items.value.length / PAGE_SIZE) - 1)
    hasMore.value = items.value.length < res.total
    viewSig.value = sig
  }

  /** 加载下一页（追加到网格尾部）。成员条件已在宿主侧下推，故分页直接作用在成员集上。 */
  async function loadMore(workspaceId: Id): Promise<void> {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      const next = page.value + 1
      const res = await api.workspaces.browse(workspaceId, buildQuery(next * PAGE_SIZE))
      items.value = [...items.value, ...res.items.map(toItemView)]
      total.value = res.total
      page.value = next
      hasMore.value = items.value.length < res.total
    } finally {
      loading.value = false
    }
  }

  /** 设置目录范围（「只看此节点」）：null 取消。范围是视图状态，不改节点可见性。 */
  function setScope(dirPath: string | null): void {
    scopeDirPath.value = dirPath
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

  /**
   * 选择交互的**唯一实现**（键鼠框架，2026-09-12）：意图由门面解释（features/selection.ts），
   * 状态变更在此收口——组件不再自写修饰键分支（历史缺陷：Ctrl+双击既切换选择又打开详情）。
   * - replace：单选；toggle：出入多选集；range：锚点→本项（按**当前视图顺序**）成区间。
   */
  function applySelection(item: ItemView, intent: SelectIntent): void {
    const list = items.value
    const index = list.findIndex((it) => it.id === item.id)
    if (intent === 'range' && anchorIndex.value != null && index >= 0) {
      const from = Math.min(anchorIndex.value, index)
      const to = Math.max(anchorIndex.value, index)
      selectedIds.value = list.slice(from, to + 1).map((it) => it.id)
      selected.value = item
      return
    }
    if (intent === 'toggle') {
      toggleSelect(item)
      anchorIndex.value = index
      return
    }
    select(item)
    anchorIndex.value = index
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

  /**
   * 框选（拖拽多选）的结果落库——与点击同一条纪律：**意图在壳，状态变更在这里**（D23/D35）。
   * - 命中集按**当前视图顺序**处理（后续 Shift 区间据此铺开），离屏 id 顺带被剔除；
   * - `replace` 整体替换为命中集；`toggle` 翻转命中条目的选中状态（文件管理器手感：
   *   第二框可撤误框），未命中的条目不动；
   * - 锚点与"选中条目"取命中集在视图里的**第一项**：随后 Shift+点击从框选起点扩展，
   *   与"从哪儿开始框的"直觉一致；toggle 把起点翻出集合时锚点仍指它（区间起点不变）。
   * - 框空：replace = 清空选择（等于点空白）；toggle = 无操作。
   */
  function setSelection(hitIds: Id[], mode: 'replace' | 'toggle'): void {
    const order = items.value.map((it) => it.id)
    const hits = new Set(hitIds)
    const orderedHits = order.filter((id) => hits.has(id))
    if (orderedHits.length === 0) {
      if (mode === 'replace') clearSelection()
      return
    }
    const anchorIdx = order.indexOf(orderedHits[0]!)
    if (anchorIdx >= 0) anchorIndex.value = anchorIdx
    if (mode === 'replace') {
      selectedIds.value = orderedHits
      selected.value = items.value[anchorIdx] ?? selected.value
      return
    }
    const prev = new Set(selectedIds.value)
    selectedIds.value = order.filter((id) => (hits.has(id) ? !prev.has(id) : prev.has(id)))
    // "选中条目"跟随：仍在集合里就保持；被翻出去则落到首个翻进来的；全部翻出去 = 无
    const cur = selected.value?.id
    if (cur == null || !selectedIds.value.includes(cur)) {
      const fallback = orderedHits.find((id) => selectedIds.value.includes(id))
      selected.value = fallback != null ? (items.value.find((it) => it.id === fallback) ?? null) : null
    }
  }

  /** 全选当前视图（已加载的成员；壳菜单「全选」/ Ctrl+A）。空视图 = 清空选择。 */
  function selectAll(): void {
    if (items.value.length === 0) {
      clearSelection()
      return
    }
    setSelection(
      items.value.map((it) => it.id),
      'replace'
    )
  }

  /** 多选集计数（右键/批量入口判断）。 */
  function selectionCount(): number {
    return selectedIds.value.length
  }

  function clearSelection(): void {
    selected.value = null
    selectedIds.value = []
    anchorIndex.value = null
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

  /** 格式筛选（显示面板的类别块）：再点一次取消；下推为扩展名集合（D36）。 */
  function toggleMediaType(t: FilterableMediaType): void {
    const list = filter.value.mediaTypes
    filter.value.mediaTypes = list.includes(t) ? list.filter((x) => x !== t) : [...list, t]
  }

  /**
   * 当前视图条件下的类别计数（显示面板格式块的数字）：视图条件（工作区/关键字/标签/范围）
   * 照常生效、**唯独不含格式自身**——每类别一次 limit:1 的 browse，只取 total。
   */
  async function categoryCounts(): Promise<Partial<Record<FilterableMediaType, number>>> {
    const ws = viewWorkspaceId.value
    if (ws == null) return {}
    const base = buildQuery(0)
    base.limit = 1
    base.offset = 0
    const entries = await Promise.all(
      FILTERABLE_MEDIA_TYPES.map(async (t) => {
        const res = await api.workspaces.browse(ws, { ...base, extensions: extensionsFor([t]) })
        return [t, res.total] as const
      })
    )
    return Object.fromEntries(entries)
  }

  /** 只看未挂标签的条目（补全打标工作流：先找到没打过的，再打）。 */
  function toggleUntaggedOnly(): void {
    filter.value.untaggedOnly = !filter.value.untaggedOnly
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

  /**
   * 搜索词法的落点：关键字与排除标签**成对**设置（SearchBar 解析 `-标签` 后一次性交入）。
   * 排除标签的书写处只有搜索框词元，成对设置避免"字变了筛选没变"的半拍状态。
   */
  function setSearch(keyword: string, excludedTagIds: Id[]): void {
    filter.value.keyword = keyword
    filter.value.excludedTagIds = [...excludedTagIds]
  }

  /**
   * 当前视图的**顺序上下文**（打开详情页时固化到标签项）：详情页的"上一张 / 下一张"沿它走。
   * 与 buildQuery 同源——少的只有工作区（由调用方给）与分页（分页不进上下文：
   * 序列是全量、翻页自己会跨页取）。
   */
  function orderContext(): Omit<ItemContext, 'workspaceId' | 'radius'> {
    const ctx: Omit<ItemContext, 'workspaceId' | 'radius'> = {
      order: sortBy.value,
      orderDir: sortDir.value
    }
    if (filter.value.tagIds.length) ctx.withAllTags = [...filter.value.tagIds]
    if (filter.value.excludedTagIds.length) ctx.withoutAnyTag = [...filter.value.excludedTagIds]
    if (filter.value.keyword) ctx.titleContains = filter.value.keyword
    if (scopeDirPath.value != null) ctx.underDirPath = scopeDirPath.value
    if (filter.value.mediaTypes.length) ctx.extensions = extensionsFor(filter.value.mediaTypes)
    if (filter.value.untaggedOnly) ctx.withoutTags = true
    return ctx
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
    scopeDirPath,
    sortBy,
    sortDir,
    page,
    hasMore,
    total,
    viewWorkspaceId,
    viewSig,
    load,
    loadMore,
    refreshInPlace,
    scan,
    select,
    applySelection,
    setSelection,
    selectAll,
    toggleSelect,
    isSelected,
    selectionCount,
    clearSelection,
    patchItemThumbnail,
    tagSelected,
    untagSelected,
    toggleTagFilter,
    toggleUntaggedOnly,
    toggleMediaType,
    categoryCounts,
    clearTagFilters,
    setKeyword,
    setSearch,
    setScope,
    orderContext,
    viewSignature,
    toggleSortDir
  }
})
