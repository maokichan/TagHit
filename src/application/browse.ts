/**
 * 浏览与声明投影（应用层用例）。
 *
 * 成员资格 = **派生**：file 条目可见于某工作区，当且仅当其直接节点
 * （sourceUri 父目录对应的 PathNode）存在且 included；anchor 条目无来源、不进工作区视图。
 * 声明投影 = 交付标签取 条目全部标签 ∩ 工作区声明子集（未声明者不交付，记入 hiddenCount）。
 *
 * **派生条件下沉（2026-09-12 修复）**：成员条件作为 `ItemsQuery.directNodeStateIn`
 * 交给存储翻译，应用层不再"取回来再筛"。原实现的缺陷是顺序颠倒——
 * 存储先按 order/limit 取窗口、应用层再剔除非成员，于是窗口里剩几条就显示几条，
 * 可见条目数随排序键与方向变化（排序变、数量变）。条件下沉后 ORDER BY/LIMIT/OFFSET
 * 一律作用于成员集，total 亦为成员总数。
 */

import type { Id, Item, Tag } from '../domain/index.ts'
import type { ItemHit, ItemsQuery } from '../ports/index.ts'
import type { AppServices } from './services.ts'

/** 投影后的条目视图。 */
export interface ProjectedHit {
  item: Item
  /** 交付标签（声明子集；保持存储返回的按名升序）。 */
  tags: Tag[]
  /** 未声明而未交付的标签数。 */
  hiddenCount: number
}

/** 浏览结果：本页条目 + 成员总数（分页语义；total 不受 limit/offset 影响）。 */
export interface BrowseResult {
  items: ProjectedHit[]
  total: number
}

/** 工作区已声明的标签 id 集合（投影依据）。 */
export async function declaredTagIds(svc: AppServices, workspaceId: Id): Promise<Id[]> {
  const rows = await svc.store.listDeclarations({ workspaceId })
  return rows.map((row) => row.tagId)
}

/**
 * 浏览工作区：成员条件下沉到查询（直接节点 included），再对交付标签做声明投影。
 * 查询条件（标签过滤/关键字/目录范围）只作为附加过滤，不能越出工作区成员集。
 */
export async function browseWorkspace(
  svc: AppServices,
  workspaceId: Id,
  q: ItemsQuery = {}
): Promise<BrowseResult> {
  const declared = new Set(await declaredTagIds(svc, workspaceId))
  const scope: ItemsQuery = { ...q, directNodeStateIn: { workspaceId, state: 'included' } }
  const [hits, total] = await Promise.all([
    svc.store.queryItems(scope),
    svc.store.countItems(scope),
  ])
  const items: ProjectedHit[] = hits.map(({ item, tags }) => {
    const visible = tags.filter((tag) => declared.has(tag.id))
    return { item, tags: visible, hiddenCount: tags.length - visible.length }
  })
  return { items, total }
}

/**
 * 可见性摘要：回答"为什么看不到全部内容"——把不可见的条目按原因分类计数。
 *
 * - visible：成员（直接节点 included）= 浏览可见的条数；
 * - hiddenByExcluded：直接节点被用户排除 → 排除只隐藏其**直接**条目（不级联）；
 * - nodeMissing：直接节点行不存在（目录已消失或未被扫描到）→ 条目仍在库中但无归属。
 *
 * 与浏览共用同一份派生译文（directNodeStateIn），故三者之和 == 该工作区来源根下的条目总数
 * ——**含来源根嵌套/重叠**的情形：根下总数用 `underAnyDir` 一次并集计数，
 * 不逐根求和（逐根求和会把重叠部分重复计入，nodeMissing 因此虚高，2026-09-30 修）。
 */
export interface VisibilitySummary {
  visible: number
  hiddenByExcluded: number
  nodeMissing: number
}

export async function visibilitySummary(
  svc: AppServices,
  workspaceId: Id
): Promise<VisibilitySummary> {
  const roots = (await svc.store.listWorkspaceRoots(workspaceId)).map((r) => r.path)
  const included = await svc.store.countItems({
    directNodeStateIn: { workspaceId, state: 'included' },
  })
  const excluded = await svc.store.countItems({
    directNodeStateIn: { workspaceId, state: 'excluded' },
  })
  const underRoots = await svc.store.countItems({ underAnyDir: roots })
  return {
    visible: included,
    hiddenByExcluded: excluded,
    // 根下总数 − 有节点归属者 = 直接节点行缺失者（无来源根则恒为 0）。
    // 并集计数后三者是同一集合的划分；钳零只是数据不一致时的兜底，不再用来掩盖多计。
    nodeMissing: Math.max(0, underRoots - included - excluded),
  }
}

/**
 * 条目详情页的**顺序上下文**（渲染层在打开标签页的瞬间固化，见渲染层 tab 的 ItemTab）：
 * 决定"上一张 / 下一张"沿哪个序列走。字段与工作区视图的查询条件一一对应——
 * 这样"详情页的下一张"与"网格里的下一张"是同一个序列。
 */
export interface ItemContext {
  /** 工作区成员前提；null/缺省 = 跨工作区（全局搜索、主页搜索结果）。 */
  workspaceId?: Id | null
  order?: ItemsQuery['order']
  orderDir?: 'asc' | 'desc'
  /** 视图筛选（与工作区视图同款下推条件）。 */
  withAllTags?: Id[]
  titleContains?: string
  /** 「只看某节点」的目录范围。 */
  underDirPath?: string | null
  /** 前后各取多少条（缺省 6，钳制 1..24）。 */
  radius?: number
}

/** 顺序窗口结果：序列片段（含锚条目）+ 位置 + 总数。 */
export interface ItemWindowResult {
  /** 窗口条目，按顺序上下文排列；锚条目在当前序列内找不到 → 空数组。 */
  items: ItemHit[]
  /** 锚条目在序列中的 0 起位置；找不到 → -1。 */
  index: number
  total: number
  /**
   * true = 锚条目**不在固化视图的序列里**，已退到"全部素材"顺序（仍只认素材条目、保留排序）。
   * 渲染层据此如实提示（而不是给用户一个死胡同）。
   */
  loose: boolean
}

/** 顺序上下文 → 查询条件（窗口与浏览同源的那一份）。 */
function contextScope(ctx: ItemContext): ItemsQuery {
  const scope: ItemsQuery = {
    kinds: ['file'],
    order: ctx.order ?? 'createdAt',
    orderDir: ctx.orderDir ?? 'desc',
  }
  if (ctx.workspaceId != null) {
    scope.directNodeStateIn = { workspaceId: ctx.workspaceId, state: 'included' }
  }
  if (ctx.withAllTags?.length) scope.withAllTags = ctx.withAllTags
  if (ctx.titleContains) scope.titleContains = ctx.titleContains
  if (ctx.underDirPath != null && ctx.underDirPath !== '') scope.underDirPath = ctx.underDirPath
  return scope
}

/** 上下文是否带"视图条件"（工作区成员前提或视图筛选）；纯排序不算。 */
function hasViewConditions(ctx: ItemContext): boolean {
  return (
    ctx.workspaceId != null ||
    (ctx.withAllTags?.length ?? 0) > 0 ||
    ctx.titleContains != null ||
    (ctx.underDirPath != null && ctx.underDirPath !== '')
  )
}

/**
 * 条目窗口：详情页翻页与前后预览的数据面（2026-09-30）。
 *
 * 三条口径：① 只认**素材条目**（kinds = file）——锚条目不是内容，不进浏览序列；
 * ② 成员条件与浏览同源（`directNodeStateIn`），故序列与网格一致；
 * ③ 窗口只用于导航与预览，**不做声明投影**（当前条目的标签仍由详情页自己按 id 取），
 * 因此这里只落存储调用，翻页成本可控。
 *
 * **找不到就退一步**（2026-09-30 补）：锚条目可能不在固化视图的序列里——从搜索结果打开后
 * 关键词又变了、从信息面板跨工作区打开、条目无节点归属、不在「只看某节点」范围内……
 * 这些都不是"没有内容可翻"，而是"它不在这条序列上"。此时退到**全部素材**（保留排序方向），
 * 让翻页继续可用，并用 `loose` 如实回报；连全部素材里都没有（例如锚条目）才是真的没有序列。
 */
export async function itemWindow(
  svc: AppServices,
  anchorId: Id,
  ctx: ItemContext = {}
): Promise<ItemWindowResult> {
  const radius = Math.min(24, Math.max(1, Math.floor(ctx.radius ?? 6)))
  const win = await svc.store.itemWindow({ scope: contextScope(ctx), anchorId, radius })
  if (win.index >= 0) return { items: win.hits, index: win.index, total: win.total, loose: false }
  if (!hasViewConditions(ctx)) {
    // 本来就是"全部素材"序列：找不到就是真的不在序列内（如锚条目），不再重试
    return { items: [], index: -1, total: win.total, loose: false }
  }
  const looseScope: ItemsQuery = {
    kinds: ['file'],
    order: ctx.order ?? 'createdAt',
    orderDir: ctx.orderDir ?? 'desc',
  }
  const looseWin = await svc.store.itemWindow({ scope: looseScope, anchorId, radius })
  return {
    items: looseWin.hits,
    index: looseWin.index,
    total: looseWin.total,
    loose: true,
  }
}
