import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface HomeTab {
  key: string
  kind: 'home'
  title: string
}

export interface WorkspaceTabItem {
  key: string
  kind: 'workspace'
  workspaceId: number
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
  itemId: number
  workspaceId: number | null
  title: string
}

export type Tab = HomeTab | WorkspaceTabItem | SettingsTab | ItemTab

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

  /** "+"：新建一个全新的主页标签（每次都是新的首页） */
  function openNewHome(): void {
    const tab = newHomeTab()
    tabs.value.push(tab)
    activeKey.value = tab.key
  }

  /**
   * 打开工作区：当前标签直接变成该工作区（不新增标签）。
   * 若该工作区已存在于其他标签，则关闭当前标签并激活已有标签，避免重复。
   */
  function openWorkspace(id: number, title: string): void {
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
   * 若同一条目已有标签页，则激活它并更新上下文（工作区/标题）。
   */
  function openItem(itemId: number, workspaceId: number | null, title: string): void {
    const existing = tabs.value.find(
      (t): t is ItemTab => t.kind === 'item' && t.itemId === itemId
    )
    if (existing) {
      existing.workspaceId = workspaceId
      existing.title = title
      activeKey.value = existing.key
      return
    }
    const tab: ItemTab = { key: `item:${itemId}`, kind: 'item', itemId, workspaceId, title }
    tabs.value.push(tab)
    activeKey.value = tab.key
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
    openSettings,
    setActive,
    close,
    move
  }
})
