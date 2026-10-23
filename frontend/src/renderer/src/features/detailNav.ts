/**
 * 条目详情页的翻页动作桥（渲染层内部）。
 *
 * 为什么需要它：翻页必须是**命令**（"快捷键是命令注册表的视图"，D23）——命令在启动时
 * 统一注册、可被发现/被重新绑定；而"上一张 / 下一张"的实现在详情页里（它持有顺序窗口）。
 * 于是详情页在挂载期把两个动作登记到本桥，卸载即清空；命令处理器只调桥——
 * 没挂详情页时是空操作（这也就是它的"生效范围"判定，无需给命令加路由谓词）。
 */

import { useConfigStore } from '../stores/config'

const config = useConfigStore()

export interface DetailNav {
  prev: () => void
  next: () => void
  /** 速打标签（数字键 1..9）：实现仍在本页（持有 toggleTag 与工作区），命令只调桥。 */
  workspaceId?: string
  toggleTag?: (tagId: string) => void | Promise<void>
  /** 编辑模式（Ctrl+E 双向切换；模式态挂在条目标签项上，翻页保持、新开详情回到阅读态）。 */
  toggleEdit?: () => void
  isEditing?: () => boolean
}

let current: DetailNav | null = null

/** 详情页挂载时登记；返回值 = 卸载时调用（只在自己仍是当前登记时清空）。 */
export function registerDetailNav(nav: DetailNav): () => void {
  current = nav
  return () => {
    if (current === nav) current = null
  }
}

export function detailPrev(): void {
  current?.prev()
}

export function detailNext(): void {
  current?.next()
}

/** 速打标签执行：数字键 → 本工作区 pin 的标签（映射配置在标签全页）→ 本页 toggleTag。 */
export function detailQuickTag(digit: number): void | Promise<void> {
  if (current?.toggleTag == null || current.workspaceId == null) return
  const pins = config.value('tags', `pinned:${current.workspaceId}`, []) as Array<string | null>
  const tagId = pins[digit - 1]
  if (tagId != null) return current.toggleTag(tagId)
}

/** 切换编辑模式：桥只转发，模式态与守卫（无工作区不可编辑）在详情页。 */
export function detailToggleEdit(): void {
  current?.toggleEdit?.()
}

/**
 * 详情页翻页是否可用（当前是否挂着详情页）。
 * 壳把它填进调用上下文（MenuContext 的现场事实），命令的 when 据此判定：
 * 没挂详情页时"上一张 / 下一张"对用户是**空的**，命令面板要如实标不可用，
 * 而不是让它执行成一个静默空操作（D31 的"生效范围"由此从提示文字变成可求值的事实）。
 */
export function isDetailNavMounted(): boolean {
  return current != null
}

/** 详情页可否打标（挂着详情页且带工作区上下文）——编辑模式开关的生效范围事实。 */
export function isDetailTaggable(): boolean {
  return current != null && current.workspaceId != null
}

/** 详情页是否处于编辑模式——修改类命令（数字速打）的生效范围事实。 */
export function isDetailEditing(): boolean {
  return current?.isEditing?.() === true
}
