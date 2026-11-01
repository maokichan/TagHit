import router from '../router'
import { useTabStore, type Tab } from '../stores/tab'
import { itemRoute, pluginRoute, routeOfTab, tagRoute } from './routes'
import { playbackPause, playbackSnapshot } from './playback/playback'

/**
 * 标签与导航的**语义单点**（壳能力）。
 *
 * 导航规则（DECISIONS）：
 * - **激活已有标签（点标签栏、关闭标签后的回落、切工具）= replace**——切换标签不是"去了一个新地方"，
 *   不该往历史栈里压记录。若标签切换也 push，**所有标签切换就串进同一条全局历史**：
 *   侧键返回会在这条"标签访问日志"上倒退，退进某个仍开着的旧标签——
 *   标签没有各自的历史栈，共享一个串行历史，这正是要防的"伪标签页"。
 * - **打开一个视图（新建标签、从网格/搜索打开条目、从面板打开全页）= push**——
 *   这是"去了一个新地方"，返回 = 撤销这次打开，语义自然。
 *
 * 本文件只留**副作用**（激活标签、改路由）；映射与上下文解析这些纯规则在 `./routes.ts`
 * ——单列是为了让渲染层的这套规则能被测试直接跑（不 import router 就拉不进 .vue 组件图）。
 */

// 纯规则从本文件原样再导出：既有调用点的 import 面不变（渲染层各处一直从 features/tabs 取）。
export {
  itemContextFromQuery,
  itemRoute,
  pluginRoute,
  resolveItemContext,
  routeMatchesTab,
  routeOfTab,
  tagRoute,
} from './routes'

/** 激活标签并同步路由（**不写历史**：标签切换属"换视角"，不是"去新地方"）。 */
export function activateTab(tab: Tab): void {
  useTabStore().setActive(tab.key)
  void router.replace(routeOfTab(tab))
}

/**
 * 关闭标签（关闭语义单点；TabBar 消费）。**播放生命周期（D43）**：切走/翻页不停播
 * （全局播放），但**关闭 = 终结该内容的会话**——关闭正在播放其音频的条目标签即停播
 * （引擎暂停、进度保留；停用后重开标签点播放可续）。
 */
export function closeTab(key: string): void {
  const tab = useTabStore().tabs.find((t) => t.key === key)
  if (tab?.kind === 'item' && tab.itemId === playbackSnapshot().itemId && playbackSnapshot().status === 'playing') {
    playbackPause()
  }
  useTabStore().close(key)
}

/** 当前活动标签对应的路由（守卫回落用；无活动标签 → 主页）。 */
export function activeTabRoute(): string {
  const active = useTabStore().activeTab
  return active != null ? routeOfTab(active) : '/'
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

/**
 * 打开标签主页（**写历史**：这是一次"打开"，返回应回到来处）。
 * 工作区上下文在打开瞬间固化到标签项上（共现等口径随它取）；同一标签已有标签页 = 激活。
 */
export function openTagTab(tagId: string, title: string, workspaceId: string | null): void {
  useTabStore().openTag(tagId, title, workspaceId)
  void router.push(tagRoute(tagId))
}

/**
 * 打开条目详情（**写历史**，同"打开一个视图"）：无工作区上下文的打开路径——
 * HostApi `items.open`（D46，插件"转到某条目"）的落点，与官方双击同语义
 * （顺序上下文缺省；条目已在标签页 = 激活既有标签）。
 */
export function openItemTab(itemId: string, title: string): void {
  const context = { workspaceId: null, order: 'createdAt', orderDir: 'desc' } as const
  useTabStore().openItem(itemId, null, title, context)
  void router.push(itemRoute(itemId, context))
}

/**
 * 打开插件详情页（**写历史**，同"打开一个视图"）：D46 的管理面入口，
 * 插件面板卡片点击进入；同一插件已有详情页 = 激活。
 */
export function openPluginTab(pluginId: string, title: string): void {
  useTabStore().openPlugin(pluginId, title)
  void router.push(pluginRoute(pluginId))
}
