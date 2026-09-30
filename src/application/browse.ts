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
import type { ItemsQuery } from '../ports/index.ts'
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
