/**
 * 详情页工作台槽位规则（D39）——**纯模块**：槽位类型、布局状态、分配解析、尺寸边界、
 * 布局操作的纯函数。不 import store/router/DOM（D30：渲染层的纯规则必须可测，
 * 断言在 __tests__/detailWorkbench.test.ts；组件（DetailWorkbench.vue）只做装配与持久化）。
 *
 * 三段式位置裁决：认领定内容（detailPreview，D37）→ 偏好建议位置（视图注册的 preferredSlot）
 * → 用户分配定终局（本模块的布局状态，持久化于 config 仓）。
 */

export type DetailSlotId = 'center' | 'left' | 'right' | 'bottom'

/** v0 槽位集固定（槽位集可生长 parked）；渲染序 = 左 → 中 → 右，底横贯中列下方。 */
export const DETAIL_SLOTS = ['left', 'center', 'right', 'bottom'] as const

/** 已注销（用户关掉）的视图不入栈；reset 清空。与"从未安置"区分：后者会在解析时按偏好回落。 */
export interface WorkbenchLayout {
  /** 每槽的视图 id 栈（数组序 = tab 序）。 */
  slots: Record<DetailSlotId, string[]>
  /** 每槽的活动视图 id（保证 ∈ slots[slot]；空槽为 null）。 */
  active: Record<DetailSlotId, string | null>
  sizes: { leftW: number; rightW: number; bottomH: number }
  dismissed: string[]
}

export interface SlotSizeBounds {
  min: number
  max: number
  default: number
}

/** 尺寸边界：右栏继承旧信息栏（220–460，默认 288，见旧键 shell:detailRailWidth）。 */
export const SLOT_SIZE_BOUNDS: Record<'leftW' | 'rightW' | 'bottomH', SlotSizeBounds> = {
  leftW: { min: 200, max: 420, default: 260 },
  rightW: { min: 220, max: 460, default: 288 },
  bottomH: { min: 96, max: 320, default: 144 }
}

export type SlotSizeKey = keyof typeof SLOT_SIZE_BOUNDS

export function clampSlotSize(key: SlotSizeKey, px: number): number {
  const b = SLOT_SIZE_BOUNDS[key]
  if (!Number.isFinite(px)) return b.default
  return Math.min(b.max, Math.max(b.min, Math.round(px)))
}

/** 空布局（全空槽；作为解析的起点，不是出厂布局——出厂 = 解析"无存储"）。 */
export function emptyLayout(sizes?: Partial<WorkbenchLayout['sizes']>): WorkbenchLayout {
  return {
    slots: { left: [], center: [], right: [], bottom: [] },
    active: { left: null, center: null, right: null, bottom: null },
    sizes: {
      leftW: clampSlotSize('leftW', sizes?.leftW ?? SLOT_SIZE_BOUNDS.leftW.default),
      rightW: clampSlotSize('rightW', sizes?.rightW ?? SLOT_SIZE_BOUNDS.rightW.default),
      bottomH: clampSlotSize('bottomH', sizes?.bottomH ?? SLOT_SIZE_BOUNDS.bottomH.default)
    },
    dismissed: []
  }
}

/** 解析所需的视图事实：id + 槽位偏好（来自视图注册表，注册序即回落序）。 */
export interface KnownView {
  id: string
  preferredSlot?: DetailSlotId
}

/**
 * 分配解析（D39 的最后一环：用户覆盖 × 已注册视图集）。规则：
 * - 存储损坏/非布局 → 出厂（全部已知视图按偏好落位，注册序 = tab 序）；
 * - 已注销视图（不在 known）从栈中剔除、dismissed 里也清掉——插件停用不留鬼标签；
 * - 已知但任何槽都没有、且不在 dismissed 的视图（新装插件 / 版本新增内置）→ **按偏好回落**
 *   （保证每个已注册视图都可达，也接管出厂新增）；用户主动关掉的（dismissed）不回——以用户为准；
 * - active 指向已不在栈内的 id → 修正为栈首；存储尺寸越界 → clamp。
 */
export function resolveLayout(
  stored: unknown,
  known: readonly KnownView[],
  seedSizes?: Partial<WorkbenchLayout['sizes']>
): WorkbenchLayout {
  const base = emptyLayout(seedSizes)
  const storedLayout = asLayout(stored)
  if (storedLayout == null) {
    assignMissing(base, known)
    return base
  }
  const knownIds = new Set(known.map((v) => v.id))
  const layout: WorkbenchLayout = {
    slots: { left: [], center: [], right: [], bottom: [] },
    active: { left: null, center: null, right: null, bottom: null },
    sizes: {
      leftW: storedSize(storedLayout.sizes?.leftW, 'leftW', base.sizes.leftW),
      rightW: storedSize(storedLayout.sizes?.rightW, 'rightW', base.sizes.rightW),
      bottomH: storedSize(storedLayout.sizes?.bottomH, 'bottomH', base.sizes.bottomH)
    },
    dismissed: []
  }
  // 栈：剔除已注销视图；去重（存储脏数据不至于复制标签）
  for (const slot of DETAIL_SLOTS) {
    const seen = new Set<string>()
    for (const id of storedLayout.slots?.[slot] ?? []) {
      if (typeof id !== 'string' || !knownIds.has(id) || seen.has(id)) continue
      seen.add(id)
      layout.slots[slot].push(id)
    }
  }
  // dismissed：只留已知视图（注销视图的关闭记录没意义）
  for (const id of storedLayout.dismissed ?? []) {
    if (typeof id === 'string' && knownIds.has(id) && !layout.dismissed.includes(id)) {
      layout.dismissed.push(id)
    }
  }
  // 已知但无归宿且未被用户关掉 → 按偏好回落
  assignMissing(layout, known)
  // active 修正：必须 ∈ 本槽栈；否则栈首
  for (const slot of DETAIL_SLOTS) {
    const stack = layout.slots[slot]
    const a = storedLayout.active?.[slot]
    layout.active[slot] =
      typeof a === 'string' && stack.includes(a) ? a : (stack[0] ?? null)
  }
  return layout
}

/** 存储尺寸守门：数值且有限才采纳（clamp 后），否则回退。 */
function storedSize(v: unknown, key: SlotSizeKey, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clampSlotSize(key, v) : fallback
}

/** 把"已注册但任何槽都没有、且不在 dismissed"的视图按偏好落位（注册序遍历，追加到槽栈尾）。
 *  无偏好的视图落右栏：事实面是最不抢重心的常驻位（中心留给媒体，P6 一页一重心）。 */
function assignMissing(layout: WorkbenchLayout, known: readonly KnownView[]): void {
  const placed = new Set<string>()
  for (const slot of DETAIL_SLOTS) {
    for (const id of layout.slots[slot]) placed.add(id)
  }
  for (const view of known) {
    if (placed.has(view.id) || layout.dismissed.includes(view.id)) continue
    const slot = view.preferredSlot ?? 'right'
    layout.slots[slot].push(view.id)
    if (layout.active[slot] == null) layout.active[slot] = view.id
  }
}

// ── 布局操作（纯函数，返回新布局；组件负责持久化） ─────────────────────────────

/** 跨槽拖放：把视图移到目标槽栈尾并激活（原槽 active 修正；从 dismissed 移出——安置即收回关闭记录）。 */
export function moveView(
  layout: WorkbenchLayout,
  viewId: string,
  to: DetailSlotId
): WorkbenchLayout {
  const next = cloneLayout(layout)
  let existed = false
  for (const slot of DETAIL_SLOTS) {
    const idx = next.slots[slot].indexOf(viewId)
    if (idx >= 0) {
      existed = true
      next.slots[slot].splice(idx, 1)
      if (next.active[slot] === viewId) {
        next.active[slot] = next.slots[slot][0] ?? null
      }
    }
  }
  if (!existed) next.dismissed = next.dismissed.filter((id) => id !== viewId)
  next.slots[to].push(viewId)
  next.active[to] = viewId
  return next
}

/** 激活槽内某个 tab。 */
export function activateView(
  layout: WorkbenchLayout,
  slot: DetailSlotId,
  viewId: string
): WorkbenchLayout {
  if (!layout.slots[slot].includes(viewId)) return layout
  const next = cloneLayout(layout)
  next.active[slot] = viewId
  return next
}

/** 关闭 tab：出栈 + 入 dismissed（用户说了算，解析不再回落）。槽空则 active = null。 */
export function closeView(layout: WorkbenchLayout, viewId: string): WorkbenchLayout {
  const next = cloneLayout(layout)
  for (const slot of DETAIL_SLOTS) {
    const idx = next.slots[slot].indexOf(viewId)
    if (idx < 0) continue
    next.slots[slot].splice(idx, 1)
    if (next.active[slot] === viewId) {
      next.active[slot] = next.slots[slot][0] ?? null
    }
  }
  if (!next.dismissed.includes(viewId)) next.dismissed.push(viewId)
  return next
}

/** 尺寸调整（clamp 后写入；拖动中反复调用安全）。 */
export function setSlotSize(layout: WorkbenchLayout, key: SlotSizeKey, px: number): WorkbenchLayout {
  const next = cloneLayout(layout)
  next.sizes[key] = clampSlotSize(key, px)
  return next
}

/** 重置 = 出厂（全已知视图按偏好落位、清 dismissed；尺寸回默认）。 */
export function resetLayout(
  known: readonly KnownView[],
  seedSizes?: Partial<WorkbenchLayout['sizes']>
): WorkbenchLayout {
  const fresh = emptyLayout(seedSizes)
  assignMissing(fresh, known)
  return fresh
}

function cloneLayout(layout: WorkbenchLayout): WorkbenchLayout {
  return {
    slots: {
      left: [...layout.slots.left],
      center: [...layout.slots.center],
      right: [...layout.slots.right],
      bottom: [...layout.slots.bottom]
    },
    active: { ...layout.active },
    sizes: { ...layout.sizes },
    dismissed: [...layout.dismissed]
  }
}

/** 存储的宽松形状（解析期逐字段守门，坏字段走默认）。 */
interface StoredLayout {
  slots?: Partial<Record<DetailSlotId, unknown[]>>
  active?: Partial<Record<DetailSlotId, unknown>>
  sizes?: Partial<Record<'leftW' | 'rightW' | 'bottomH', unknown>>
  dismissed?: unknown[]
}

/** 存储形状守门：不像布局的一律当没有（坏数据不炸工作台）。 */
function asLayout(v: unknown): StoredLayout | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (o.slots == null || typeof o.slots !== 'object') return null
  return o as StoredLayout
}
