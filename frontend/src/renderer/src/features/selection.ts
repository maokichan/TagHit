/**
 * 选择交互模型（壳级，唯一实现）。
 *
 * 为什么在壳：修饰键 → 选择意图的映射是多处共用的**交互语义**，散在组件里必然漂移
 * （历史缺陷：卡片自写 `@click.ctrl.exact` / `@dblclick`，于是 Ctrl+双击既切换选择又打开详情）。
 * 组件只转发**原始事件**与条目，意图解释与状态变更归壳与 item store。
 *
 * 意图（与 item store 的 applySelection 一一对应）：
 * - `range`：Shift+点击 = 从锚点到本项（按当前视图顺序）成区间选择；
 * - `toggle`：Ctrl/Cmd+点击 = 本项出入多选集；
 * - `replace`：裸点击 = 单选（清空其余）。
 */

export type SelectIntent = 'replace' | 'toggle' | 'range'

/** 修饰键 → 选择意图（Shift 优先于 Ctrl：带 Shift 的一律按区间语义）。 */
export function selectIntentOf(e: MouseEvent): SelectIntent {
  if (e.shiftKey) return 'range'
  if (e.ctrlKey || e.metaKey) return 'toggle'
  return 'replace'
}

/**
 * 是否允许触发"打开"（条目详情）：**带任何修饰键的点击都不打开**——
 * 带修饰键的点击是选择手势，用户连点两次是为了多选，不期望跳出详情页。
 */
export function allowsOpen(e: MouseEvent): boolean {
  return !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
}

/**
 * 点击是否落在"空白"（未命中任何 context target）。
 * 与右键菜单共用同一份 DOM 契约（`data-ctx-target`）：命中条目 = 非空白。
 */
export function isBlankClick(e: MouseEvent): boolean {
  const el = e.target as HTMLElement | null
  return el?.closest('[data-ctx-target]') == null
}
