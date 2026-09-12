import router from '../router'
import { useTabStore, type Tab } from '../stores/tab'

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
      return `/item/${tab.itemId}${tab.workspaceId != null ? `?workspace=${tab.workspaceId}` : ''}`
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

/** 路由 → 应激活的活动标签（守卫用同一映射，反向判定）。 */
export function routeMatchesTab(tab: Tab, path: string): boolean {
  return routeOfTab(tab) === path
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
