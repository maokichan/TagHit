/**
 * 工作台布局持有者（模块级单例，detailNav 桥同款模式）：
 * 组件实例不归命令管，布局状态归模块——DetailWorkbench 挂载时初始化（读 config 解析），
 * 运行中的变更经 commit 持久化，`detail.layoutReset` 命令经它重置。
 */
import { ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import { resolveLayout, resetLayout, type KnownView, type WorkbenchLayout } from './slots'

const config = useConfigStore()

const layoutRef = ref<WorkbenchLayout | null>(null)

/**
 * 挂载期初始化（幂等）：config 存储 → 分配解析（D39：用户覆盖为准、注销剔除、
 * 新视图按偏好回落）。无存储时从旧键 `shell:detailRailWidth` 播种右栏宽（无缝迁移）。
 */
export function initWorkbenchLayout(known: readonly KnownView[]): WorkbenchLayout {
  const stored = config.value('detailWorkbench', 'layout', null)
  const seedRail = stored == null ? config.value('shell', 'detailRailWidth', null) : null
  layoutRef.value = resolveLayout(stored, known, seedRail != null ? { rightW: seedRail } : undefined)
  return layoutRef.value
}

/** 组件读取（响应式引用；变更一律走 commit）。 */
export function workbenchLayoutRef() {
  return layoutRef
}

/** 变更落库（布局是纯数据，setValue 直接序列化；localStorage 不可用仅丢持久化）。 */
export function commitLayout(next: WorkbenchLayout): void {
  layoutRef.value = next
  config.setValue('detailWorkbench', 'layout', next)
}

/** 命令面：重置为出厂。工作台从未挂载 → false（命令的 when 已保证只在详情页在场时可用）。 */
export function resetWorkbenchLayout(known: readonly KnownView[]): boolean {
  if (layoutRef.value == null) return false
  commitLayout(resetLayout(known))
  return true
}
