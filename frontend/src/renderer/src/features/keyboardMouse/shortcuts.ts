/**
 * 快捷键注册表（壳级声明面）。
 *
 * 裁决基线（DECISIONS 2026-09-07）：**快捷键是命令注册表的视图**——绑定只指向命令 id，
 * 不携带实现；执行经 `runCommand` 走同一套 when 谓词与 HostApi 门面，与右键菜单同构。
 * 因此三方插件将来"能绑什么快捷键"= 它能注册什么命令，"能做什么"仍是权限清单。
 *
 * 与命令的差别只在**触发方式**：菜单由 click 触发、快捷键由 keydown 触发，
 * 后者的上下文（MenuContext）由壳按键鼠状态现场构造（见 keyboardMouse/setup.ts）。
 */

export interface ShortcutBinding {
  /** 目标命令 id（须已注册；未注册则在执行期忽略并告警）。 */
  commandId: string
  /** KeyboardEvent.key 的小写形式（'f' | 'escape' | 'delete' | 'arrowdown' …）。 */
  key: string
  /** Ctrl 或 Cmd（跨平台同一语义：macOS 用 Cmd）。 */
  mod?: boolean
  shift?: boolean
  alt?: boolean
  /** 是否允许在输入态（input/textarea/contenteditable）触发；缺省 false（防打字误触）。 */
  allowInEditable?: boolean
  /** 开关来源：功能组件的设置项关闭时该绑定失效（如 Ctrl+F 随"键鼠交互"设置）。 */
  gate?: { featureId: string; key: string; fallback: boolean }
  /** 展示用（设置页/将来的命令面板）。 */
  label?: string
}

const bindings: ShortcutBinding[] = []

/** 注册绑定（重复组合键 = 后注册者不覆盖，返回 false 并告警——冲突在开发期暴露）。 */
export function registerShortcut(binding: ShortcutBinding): boolean {
  if (matchShortcutBy(binding) != null) {
    console.warn(`[shortcuts] 组合键冲突，已忽略：${describe(binding)} → ${binding.commandId}`)
    return false
  }
  bindings.push(binding)
  return true
}

/** 全部绑定（只读视图；设置页与将来的命令面板据此展示）。 */
export function listShortcuts(): readonly ShortcutBinding[] {
  return bindings
}

/** 清空注册（测试/热重载用；官方启动路径不调用）。 */
export function clearShortcuts(): void {
  bindings.length = 0
}

function sameKey(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    (a.mod ?? false) === (b.mod ?? false) &&
    (a.shift ?? false) === (b.shift ?? false) &&
    (a.alt ?? false) === (b.alt ?? false)
  )
}

function matchShortcutBy(b: ShortcutBinding): ShortcutBinding | undefined {
  return bindings.find((x) => sameKey(x, b))
}

/** 事件 → 命中的绑定（含修饰键严格匹配：多余的修饰键即不命中）。 */
export function matchShortcut(e: KeyboardEvent): ShortcutBinding | null {
  const key = e.key.toLowerCase()
  const mod = e.ctrlKey || e.metaKey
  return (
    bindings.find(
      (b) =>
        b.key.toLowerCase() === key &&
        (b.mod ?? false) === mod &&
        (b.shift ?? false) === e.shiftKey &&
        (b.alt ?? false) === e.altKey
    ) ?? null
  )
}

/** 绑定的人类可读描述（告警与设置页用）。 */
export function describe(b: ShortcutBinding): string {
  const parts: string[] = []
  if (b.mod) parts.push('Ctrl')
  if (b.shift) parts.push('Shift')
  if (b.alt) parts.push('Alt')
  parts.push(b.key.length === 1 ? b.key.toUpperCase() : b.key)
  return parts.join('+')
}

/** 事件目标是否处于输入态。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (el == null || el.tagName == null) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true
}
