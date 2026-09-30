import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ItemContext } from '@shared/contract'

export interface HomeTab {
  key: string
  kind: 'home'
  title: string
}

export interface WorkspaceTabItem {
  key: string
  kind: 'workspace'
  workspaceId: string
  title: string
}

export interface SettingsTab {
  key: 'settings'
  kind: 'settings'
  title: string
}

export interface ItemTab {
  key: string
  kind: 'item'
  itemId: string
  workspaceId: string | null
  title: string
  /**
   * **顺序上下文**（打开瞬间固化，见“相册式详情页”裁决）：详情页的"上一张 / 下一张"
   * 沿它走——字段与来处的视图条件一一对应。翻页只改 itemId，上下文不变。
   */
  context: ItemContext
}

/**
 * 功能组件内容标签页（contentTab 贡献点，DECISIONS 2026-09-07）：
 * 壳持有标签项（featureId/title/激活），组件自持内容状态；关闭即销毁；
 * 同一 feature 单实例（重复打开 = 激活既有标签）。
 *
 * `workspaceId` = 打开瞬间固化的**工作区上下文**：功能标签页成为活动标签后，
 * `activeWorkspaceId` 即为 null（活动标签不是工作区），全页组件不能靠运行时推断拿上下文。
 */
export interface FeatureTab {
  key: string
  kind: 'feature'
  featureId: string
  title: string
  workspaceId: string | null
}

export type Tab = HomeTab | WorkspaceTabItem | SettingsTab | ItemTab | FeatureTab

let homeSeq = 0

function newHomeTab(): HomeTab {
  homeSeq += 1
  return { key: `home:${homeSeq}`, kind: 'home', title: '主页' }
}

/**
 * 浏览器式标签页：
 * - 主页标签可多开：每次新建标签页（"+"）进入一个全新的首页
 * - 工作区标签：kind='workspace'；在首页点击工作区 = 当前标签直接变成该工作区（不新增标签）
 * - 条目标签：kind='item'；点击媒体进入详情 = 新开一个条目标签页（当前标签不受影响）
 * - 设置是普通标签页（单实例，可关闭）
 * - 关闭最后一个标签时自动新建一个主页标签（标签栏始终非空）
 */
export const useTabStore = defineStore('tab', () => {
  const tabs = ref<Tab[]>([])
  const activeKey = ref<string | null>(null)

  function ensureHome(): void {
    if (tabs.value.length === 0) {
      const tab = newHomeTab()
      tabs.value.push(tab)
      activeKey.value = tab.key
    } else if (activeKey.value == null || !tabs.value.some((t) => t.key === activeKey.value)) {
      activeKey.value = tabs.value[0].key
    }
  }

  /**
   * "+"：主页单例（2026-08-23 用户决策）——已有主页标签则激活它，没有才新建。
   * 主页只在"没有多余标签页"或"新建标签页"时出现，其他情况下不被随意访问。
   */
  function openNewHome(): void {
    const existing = tabs.value.find((t) => t.kind === 'home')
    if (existing) {
      activeKey.value = existing.key
      return
    }
    const tab = newHomeTab()
    tabs.value.push(tab)
    activeKey.value = tab.key
  }

  /**
   * 打开工作区：当前标签直接变成该工作区（不新增标签）。
   * 若该工作区已存在于其他标签，则关闭当前标签并激活已有标签，避免重复。
   */
  function openWorkspace(id: string, title: string): void {
    const existing = tabs.value.find((t) => t.kind === 'workspace' && t.workspaceId === id)
    if (existing) {
      const cur = activeKey.value
      if (cur && cur !== existing.key) {
        const curIdx = tabs.value.findIndex((t) => t.key === cur)
        if (curIdx !== -1) tabs.value.splice(curIdx, 1)
      }
      activeKey.value = existing.key
      return
    }
    const idx = tabs.value.findIndex((t) => t.key === activeKey.value)
    const tab: WorkspaceTabItem = { key: `ws:${id}`, kind: 'workspace', workspaceId: id, title }
    if (idx >= 0) {
      tabs.value.splice(idx, 1, tab)
    } else {
      tabs.value.push(tab)
    }
    activeKey.value = tab.key
  }

  /** 设置：作为独立标签页打开（已存在则激活），可关闭 */
  function openSettings(): void {
    ensureHome()
    if (!tabs.value.some((t) => t.kind === 'settings')) {
      tabs.value.push({ key: 'settings', kind: 'settings', title: '设置' })
    }
    activeKey.value = 'settings'
  }

  /**
   * 打开条目详情：新开一个条目标签页（不占用当前标签）。
   * 若同一条目已有标签页，则激活它并更新上下文（工作区/标题/顺序上下文）。
   * `context` = **顺序上下文**（来自工作区视图、搜索结果等）；缺省按默认排序、跨工作区。
   */
  function openItem(
    itemId: string,
    workspaceId: string | null,
    title: string,
    context: ItemContext = { workspaceId, order: 'createdAt', orderDir: 'desc' }
  ): void {
    const existing = tabs.value.find(
      (t): t is ItemTab => t.kind === 'item' && t.itemId === itemId
    )
    if (existing) {
      existing.workspaceId = workspaceId
      existing.title = title
      existing.context = context
      activeKey.value = existing.key
      return
    }
    const tab: ItemTab = { key: `item:${itemId}`, kind: 'item', itemId, workspaceId, title, context }
    tabs.value.push(tab)
    activeKey.value = tab.key
  }

  /**
   * 详情页翻页：在当前条目标签内换内容（同一个浏览会话不新开标签——翻十张就是十个标签，
   * 那是标签栏的灾难）。顺序上下文不变（它固化的是"从哪个视图进来的"），标题随之更新，
   * 标签键同步改成新条目 id；若目标条目**已有**标签页，则本次翻页落到它上面（不留重复键）。
   */
  function flipItemTab(fromItemId: string, toItemId: string, title: string): void {
    const tab = tabs.value.find((t): t is ItemTab => t.kind === 'item' && t.itemId === fromItemId)
    if (tab == null) return
    const targetKey = `item:${toItemId}`
    const existing = tabs.value.find((t) => t.key === targetKey && t !== tab)
    if (existing != null) {
      const idx = tabs.value.indexOf(tab)
      if (idx >= 0) tabs.value.splice(idx, 1)
      activeKey.value = existing.key
      return
    }
    const oldKey = tab.key
    tab.itemId = toItemId
    tab.title = title
    tab.key = targetKey
    if (activeKey.value === oldKey) activeKey.value = targetKey
  }

  /**
   * 打开功能组件内容标签页（contentTab）：单实例；重复打开 = 激活既有标签。
   * workspaceId 传入非空时更新该标签的工作区上下文（从无上下文的入口打开时不清掉已有的）。
   */
  function openFeature(featureId: string, title: string, workspaceId: string | null = null): void {
    const key = `feature:${featureId}`
    const existing = tabs.value.find(
      (t): t is FeatureTab => t.kind === 'feature' && t.featureId === featureId
    )
    if (existing) {
      if (workspaceId != null) existing.workspaceId = workspaceId
      existing.title = title
      activeKey.value = key
      return
    }
    const tab: FeatureTab = { key, kind: 'feature', featureId, title, workspaceId }
    tabs.value.push(tab)
    activeKey.value = key
  }

  function setActive(key: string): void {
    if (tabs.value.some((t) => t.key === key)) activeKey.value = key
  }

  function close(key: string): void {
    const idx = tabs.value.findIndex((t) => t.key === key)
    if (idx === -1) return
    tabs.value.splice(idx, 1)
    if (tabs.value.length === 0) {
      // 最后一个标签关闭 → 自动新建主页标签
      const tab = newHomeTab()
      tabs.value.push(tab)
      activeKey.value = tab.key
      return
    }
    if (activeKey.value === key) {
      const next = tabs.value[Math.max(0, idx - 1)] ?? tabs.value[0]
      activeKey.value = next ? next.key : null
    }
  }

  /** 拖拽排序 */
  function move(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return
    const t = tabs.value[fromIndex]
    if (!t) return
    tabs.value.splice(fromIndex, 1)
    tabs.value.splice(toIndex, 0, t)
  }

  const activeTab = computed(() => tabs.value.find((t) => t.key === activeKey.value) ?? null)
  const activeWorkspaceId = computed(() =>
    activeTab.value?.kind === 'workspace' ? activeTab.value.workspaceId : null
  )

  return {
    tabs,
    activeKey,
    activeTab,
    activeWorkspaceId,
    ensureHome,
    openNewHome,
    openWorkspace,
    openItem,
    flipItemTab,
    openFeature,
    openSettings,
    setActive,
    close,
    move
  }
})
