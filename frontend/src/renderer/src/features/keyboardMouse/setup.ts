/**
 * 功能组件：键鼠交互 —— 行为注册（快捷键执行器；远期鼠标手势在此扩展）。
 * 无面板 UI，仅挂设置页（配置项见 registry.ts 中 keyboardMouse 的 settings）。
 *
 * 框架（2026-09-12 标准化）：
 * 1. **快捷键注册表**（features/keyboardMouse/shortcuts.ts）持绑定 → 命令 id；
 *    本文件只做**执行器**：keydown → 命中绑定 → 开关闸门 → 构造上下文 → 求值 when → 跑命令。
 *    ——快捷键与右键菜单共用同一张命令注册表（DECISIONS：快捷键是命令注册表的视图）。
 * 2. **选择交互模型**在 features/selection.ts（修饰键解释）与 item store（applySelection）；
 *    组件只转发原始事件。行为在框架就位后逐个增补（本文件不含业务命令）。
 *
 * 上下文构造沿用调用面基线：`target.kind = 'shell'`（键盘无目标）、workspaceId 取活动标签、
 * selection 取当前多选集——与右键菜单的 MenuContext 同形，命令无需为快捷键另写一套。
 *
 * 生命周期守契约：setup 返回 disposer，退订由注册表管理（D6：事件订阅必须可退订）；
 * 幂等由 setupFeature 的 per-entry 守卫保证，此处不再自设标志位。
 */
import { useConfigStore } from '../../stores/config'
import { useItemStore } from '../../stores/item'
import { useTabStore } from '../../stores/tab'
import { evalWhen, getCommand } from '../commands'
import {
  describe,
  isEditableTarget,
  listShortcuts,
  matchShortcut,
  type ShortcutBinding
} from './shortcuts'
import type { MenuContext } from '@shared/types/command'

/** 键盘触发的上下文：无 DOM 目标 → target.kind = 'shell'（命令的 when 以此判断可用性）。 */
function shellContext(): MenuContext {
  const itemStore = useItemStore()
  const tabStore = useTabStore()
  return {
    target: { kind: 'shell' },
    workspaceId: tabStore.activeWorkspaceId,
    selection: { ids: [...itemStore.selectedIds] }
  }
}

/** 开关闸门：绑定声明的功能组件设置项关闭时不触发。 */
function enabledByGate(binding: ShortcutBinding): boolean {
  if (binding.gate == null) return true
  const config = useConfigStore()
  return config.value(binding.gate.featureId, binding.gate.key, binding.gate.fallback)
}

/**
 * 媒体元素（video/audio）自带键盘语义：方向键属于原生控件（seek/音量），
 * 绑定的方向键在此**让位**——不触发、也不 preventDefault，否则视频就没法用键盘定位。
 * （详情页的翻页因此同时提供 PgUp/PgDn 与两侧按钮，见 officialCommands。）
 */
function isMediaTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (el == null || el.tagName == null) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'video' || tag === 'audio'
}

function isArrowKey(key: string): boolean {
  const k = key.toLowerCase()
  return k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown'
}

async function runBinding(binding: ShortcutBinding): Promise<void> {
  const entry = getCommand(binding.commandId)
  if (entry == null) {
    console.warn(`[shortcuts] 绑定指向未注册命令：${binding.commandId}（${describe(binding)}）`)
    return
  }
  const ctx = shellContext()
  if (!evalWhen(entry.manifest.when, ctx)) return
  try {
    await entry.run(ctx)
  } catch (e) {
    console.error(`[shortcuts] 命令执行失败：${binding.commandId}`, e)
  }
}

export function setupKeyboardMouse(): () => void {
  const onKeydown = (e: KeyboardEvent): void => {
    const binding = matchShortcut(e)
    if (binding == null) return
    // 输入态默认不触发（防打字误触）；Escape 与显式放行的绑定除外
    if (isEditableTarget(e.target) && binding.allowInEditable !== true && binding.key !== 'escape') {
      return
    }
    // 媒体元素聚焦时方向键让位原生控件（不触发、不吞键）
    if (isMediaTarget(e.target) && isArrowKey(binding.key)) return
    if (!enabledByGate(binding)) return
    e.preventDefault()
    void runBinding(binding)
  }
  window.addEventListener('keydown', onKeydown)
  // 启动日志：把"当前生效的键位"显式打出来，避免"绑了但没生效"这类沉默失败
  console.log(
    `[shortcuts] 已注册：${listShortcuts()
      .map((b) => `${describe(b)} → ${b.commandId}`)
      .join(' · ')}`
  )
  return () => window.removeEventListener('keydown', onKeydown)
}
