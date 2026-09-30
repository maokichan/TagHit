import router from '../router'
import { useTabStore, type Tab } from '../stores/tab'
import type { ItemContext } from '@shared/contract'

/**
 * 标签与导航的**语义单点**（壳能力）。
 *
 * 导航规则（2026-09-12 定，修"侧键返回到不该去的地方"）：
 * - **激活已有标签（点标签栏、关闭标签后的回落、切工具）= replace**——切换标签不是"去了一个新地方"，
 *   不该往历史栈里压记录。此前每次标签点击都 push，于是**所有标签切换被串进同一条全局历史**，
 *   侧键返回变成在这条"标签访问日志"上倒退，退到某个仍开着的旧标签（如更早打开的条目详情）
 *   就被守卫激活 → 跳到用户没预期的地方。这是"伪标签页"的真实成因：
 *   标签没有各自的历史栈，共享一个串行历史。
 * - **打开一个视图（新建标签、从网格/搜索打开条目、从面板打开全页）= push**——
 *   这是"去了一个新地方"，返回 = 撤销这次打开，语义自然。
 */

/**
 * 条目详情路由：**顺序上下文随路由携带**（打开时写、刷新后读回）——
 * 路由是标签的投影，上下文必须能从路由复原，否则刷新一次详情页就丢了"从哪个视图进来的"。
 */
export function itemRoute(itemId: string, context: ItemContext): string {
  const q = new URLSearchParams()
  if (context.workspaceId != null) q.set('workspace', context.workspaceId)
  if (context.order != null) q.set('order', context.order)
  if (context.orderDir != null) q.set('dir', context.orderDir)
  if (context.withAllTags?.length) q.set('tags', context.withAllTags.join(','))
  if (context.titleContains) q.set('q', context.titleContains)
  if (context.underDirPath != null && context.underDirPath !== '') q.set('scope', context.underDirPath)
  const s = q.toString()
  return `/item/${itemId}${s !== '' ? `?${s}` : ''}`
}

/** 路由 query → 顺序上下文（详情页读；标签项丢失时的回落路径）。 */
export function itemContextFromQuery(query: Record<string, unknown>): ItemContext {
  const str = (k: string): string | null => {
    const v = query[k]
    return typeof v === 'string' && v !== '' ? v : null
  }
  const ctx: ItemContext = {
    workspaceId: str('workspace'),
    order: (str('order') as ItemContext['order']) ?? 'createdAt',
    orderDir: str('dir') === 'asc' ? 'asc' : 'desc'
  }
  const tags = str('tags')
  if (tags != null) ctx.withAllTags = tags.split(',').filter((x) => x !== '')
  const keyword = str('q')
  if (keyword != null) ctx.titleContains = keyword
  const scope = str('scope')
  if (scope != null) ctx.underDirPath = scope
  return ctx
}

/** 标签 → 路由（唯一映射；TabBar、守卫、打开入口共用，避免各处手写模板字符串）。 */
export function routeOfTab(tab: Tab): string {
  switch (tab.kind) {
    case 'home':
      return '/'
    case 'settings':
      return '/settings'
    case 'feature':
      return `/feature/${tab.featureId}`
    case 'item':
      return itemRoute(tab.itemId, tab.context)
    case 'workspace':
      return `/workspace/${tab.workspaceId}`
  }
}

/** 激活标签并同步路由（**不写历史**：标签切换属"换视角"，不是"去新地方"）。 */
export function activateTab(tab: Tab): void {
  useTabStore().setActive(tab.key)
  void router.replace(routeOfTab(tab))
}

/** 当前活动标签对应的路由（守卫回落用；无活动标签 → 主页）。 */
export function activeTabRoute(): string {
  const active = useTabStore().activeTab
  return active != null ? routeOfTab(active) : '/'
}

/**
 * 路由是否命中该标签（守卫用同一映射反向判定）。
 *
 * 条目详情只看**路径**（`/item/:id`）：查询串是**顺序上下文**，它是标签项的投影——
 * 上下文以标签项为准（打开瞬间固化），手改查询串或编码差异都不该被当成"另一个地方"，
 * 否则守卫会把路由改写回去、翻页被弹回（编码差异在带空格/中文的搜索关键词上真实存在）。
 * 其余标签没有查询串，整串比较即可。
 */
export function routeMatchesTab(tab: Tab, path: string): boolean {
  const route = routeOfTab(tab)
  if (tab.kind !== 'item') return route === path
  const cut = (s: string): string => s.split('?')[0] ?? s
  return cut(route) === cut(path)
}

/**
 * 打开功能组件的全页呈现（**写历史**：这是一次"打开"，返回应回到来处）。
 * 工作区上下文在打开瞬间固化到标签项上——切到本标签后 `activeWorkspaceId` 会变成 null
 * （活动标签不是工作区），全页组件若运行时去推断上下文必然拿不到。
 */
export function openFeatureTab(
  featureId: string,
  title: string,
  workspaceId: string | null = null
): void {
  useTabStore().openFeature(featureId, title, workspaceId)
  void router.push(`/feature/${featureId}`)
}
