/**
 * 标签 ↔ 路由映射 与 条目详情的**顺序上下文**解析（纯函数，不碰 router 实例）。
 *
 * 为什么单列：这两套规则是渲染层最容易出错的地方（导航语义 D26、相册式详情页 D29），
 * 而"能被测试直接跑"的前提是**不 import router**——router 会把整张 .vue 组件图拉进来，
 * 纯逻辑测试就再也跑不动了。副作用（激活标签、push/replace）留在 features/tabs.ts。
 *
 * 测试：src/renderer/src/__tests__/routes.test.ts
 */

import type { ItemContext } from '@shared/contract'
import type { Tab } from '../stores/tab'

/**
 * 条目详情路由：**顺序上下文随路由携带**（打开时写、刷新后读回）。
 * 路由是标签的投影，上下文必须能从路由复原——否则刷新一次详情页就丢了"从哪个视图进来的"。
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

/** 路由 query → 顺序上下文（标签项丢失时的回落路径）。 */
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

/**
 * 解析详情页的顺序上下文：**标签项优先**（打开那一刻固化的那个）→ 路由 query →
 * 再用标签项的工作区把缺口补上。
 *
 * **绝不退成"跨工作区全库"**：`workspaceId = null` 的语义是"整库所有素材"，
 * 一旦静默退到那儿，翻页就会在整库里乱跳——实机症状正是"按方向键跳到很奇怪的地方"，
 * 成因是热重载/旧会话里仍活着的标签项**没有 context 字段**（新字段是后加的），
 * 而原来直接把它当 undefined 交给用例，用例的缺省恰好就是跨工作区。
 */
export function resolveItemContext(
  tab: { workspaceId?: string | null; context?: ItemContext | null } | null | undefined,
  query: Record<string, unknown>
): ItemContext {
  if (tab?.context != null) return tab.context
  const ctx = itemContextFromQuery(query)
  if (ctx.workspaceId == null && tab?.workspaceId != null) ctx.workspaceId = tab.workspaceId
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
