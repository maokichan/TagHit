/**
 * 详情页工作台布局规则（D41）——**分割树**。
 * 纯模块：节点类型、默认树、树操作（分割/关闭/移动/激活/权重）、序列化守门与旧格式迁移。
 * 不 import store/router/DOM（D30：渲染层纯规则必须可测，断言在 __tests__/detailWorkbench.test.ts）。
 *
 * 裁决脉络：D39 版面槽位化（固定四槽）→ D40 空槽不消失 → D41（本模块）：固定四槽升级为
 * 树生长——任意槽可向上下左右分割出新槽；边缘 = 槽与槽之间的接缝（枝内缝线，1px 全强度）；
 * 视图填满槽位；空叶保留其分配的空间（可关闭，兄弟 absorbs）。
 */

export type DetailSlotId = 'center' | 'left' | 'right' | 'bottom'

/** 分割方向（相对被分割的叶）。 */
export type SplitDir = 'left' | 'right' | 'above' | 'below'

/** 叶 = 槽：一个视图栈 + 活动 tab。 */
export interface WBLeaf {
  kind: 'leaf'
  id: string
  stack: string[]
  active: string | null
}

/** 枝 = 分割：方向 + 子节点 + 弹性权重（和为 1）。 */
export interface WBSplit {
  kind: 'split'
  id: string
  dir: 'row' | 'col'
  children: WBNode[]
  weights: number[]
}

export type WBNode = WBLeaf | WBSplit

/** 布局（持久化形状 = 本对象整体，存 config `detailWorkbench:layout`）。 */
export interface WorkbenchLayout {
  version: 2
  tree: WBNode
  dismissed: string[]
}

/** 解析所需的视图事实：id + 槽位偏好（来自视图注册表，注册序即回落序）。 */
export interface KnownView {
  id: string
  preferredSlot?: DetailSlotId
}

const MIN_WEIGHT = 0.05

// ── 节点工具（clone 后可变修改；树是纯 JSON 数据） ─────────────────────────────

function cloneNode(node: WBNode): WBNode {
  return JSON.parse(JSON.stringify(node)) as WBNode
}

export function findLeaf(node: WBNode, leafId: string): WBLeaf | null {
  if (node.kind === 'leaf') return node.id === leafId ? node : null
  for (const c of node.children) {
    const hit = findLeaf(c, leafId)
    if (hit) return hit
  }
  return null
}

function findParent(node: WBNode, leafId: string): WBSplit | null {
  if (node.kind === 'split') {
    for (const c of node.children) {
      if (c.kind === 'leaf' && c.id === leafId) return node
      const hit = findParent(c, leafId)
      if (hit) return hit
    }
  }
  return null
}

function findSplit(node: WBNode, splitId: string): WBSplit | null {
  if (node.kind === 'split') {
    if (node.id === splitId) return node
    for (const c of node.children) {
      const hit = findSplit(c, splitId)
      if (hit) return hit
    }
  }
  return null
}

function maxSeq(node: WBNode): number {
  let n = 0
  const m = /^s(\d+)$/.exec(node.id)
  if (m) n = Number(m[1])
  if (node.kind === 'split') {
    for (const c of node.children) n = Math.max(n, maxSeq(c))
  }
  return n
}

function freshId(node: WBNode): string {
  return `s${maxSeq(node) + 1}`
}

/** 单子枝折叠 + 权重归一（树的结构不变式：split 至少两子、权重和为 1 且每份 ≥ MIN_WEIGHT）。 */
function normalizeTree(node: WBNode): WBNode {
  if (node.kind === 'leaf') return node
  node.children = node.children.map(normalizeTree)
  if (node.children.length === 1) return node.children[0]!
  const sum = node.weights.reduce((a, b) => a + b, 0)
  if (!Number.isFinite(sum) || sum <= 0) {
    node.weights = node.children.map(() => 1 / node.children.length)
  } else {
    node.weights = node.weights.map((w) => w / sum)
  }
  return node
}

/** 从所有栈中摘除视图（修正 active；不入 dismissed——dismissed 是布局层语义）。 */
function unplace(tree: WBNode, viewId: string): void {
  walkLeaves(tree, (leaf) => {
    const i = leaf.stack.indexOf(viewId)
    if (i >= 0) {
      leaf.stack.splice(i, 1)
      if (leaf.active === viewId) leaf.active = leaf.stack[0] ?? null
    }
  })
}

function walkLeaves(node: WBNode, fn: (leaf: WBLeaf) => void): void {
  if (node.kind === 'leaf') {
    fn(node)
    return
  }
  for (const c of node.children) walkLeaves(c, fn)
}

function collectStacks(node: WBNode): string[] {
  const out: string[] = []
  walkLeaves(node, (leaf) => out.push(...leaf.stack))
  return out
}

// ── 默认树（出厂 = 旧版式等价面：col[预览列, 底条] 与 信息 列并排） ─────────────

function rowify(nodes: WBNode[]): WBNode {
  if (nodes.length === 1) return nodes[0]!
  return {
    kind: 'split',
    id: `s${nodes.length}-root-${Math.random().toString(36).slice(2, 8)}`,
    dir: 'row',
    children: nodes,
    weights: nodes.map(() => 1 / nodes.length)
  }
}

export function defaultLayout(known: readonly KnownView[]): WorkbenchLayout {
  const pick = (slot: DetailSlotId): string[] =>
    known.filter((v) => v.preferredSlot === slot).map((v) => v.id)
  const centerViews = [...pick('center'), ...known.filter((v) => v.preferredSlot == null).map((v) => v.id)]
  const center: WBLeaf = {
    kind: 'leaf',
    id: 's1',
    stack: centerViews,
    active: centerViews[0] ?? null
  }
  const parts: WBNode[] = [center]
  const bottomViews = pick('bottom')
  if (bottomViews.length) {
    parts.push({ kind: 'leaf', id: 's2', stack: bottomViews, active: bottomViews[0]! })
  }
  const main: WBNode =
    parts.length === 1
      ? center
      : { kind: 'split', id: 's3', dir: 'col', children: parts, weights: parts.map(() => 1 / parts.length) }
  const rightViews = pick('right')
  const leftViews = pick('left')
  const row: WBNode[] = []
  if (leftViews.length) {
    row.push({ kind: 'leaf', id: 's4', stack: leftViews, active: leftViews[0]! })
  }
  row.push(main)
  if (rightViews.length) {
    row.push({ kind: 'leaf', id: 's5', stack: rightViews, active: rightViews[0]! })
  }
  return { version: 2, tree: rowify(row), dismissed: [] }
}

// ── 树操作（纯函数：clone 后修改；返回新布局/新树） ─────────────────────────────

/** 把视图移入某叶（跨叶移动 = 先摘后插；安置即收回 dismissed 是布局层职责）。 */
function placeInLeaf(tree: WBNode, viewId: string, leafId: string): void {
  unplace(tree, viewId)
  const leaf = findLeaf(tree, leafId)
  if (leaf == null) return
  leaf.stack.push(viewId)
  leaf.active = viewId
}

export function layoutMoveView(layout: WorkbenchLayout, viewId: string, leafId: string): WorkbenchLayout {
  const tree = cloneNode(layout.tree)
  placeInLeaf(tree, viewId, leafId)
  return { version: 2, tree, dismissed: layout.dismissed.filter((id) => id !== viewId) }
}

export function layoutActivate(layout: WorkbenchLayout, leafId: string, viewId: string): WorkbenchLayout {
  const leaf = findLeaf(layout.tree, leafId)
  if (leaf == null || !leaf.stack.includes(viewId)) return layout
  const tree = cloneNode(layout.tree)
  const target = findLeaf(tree, leafId)
  if (target != null) target.active = viewId
  return { ...layout, tree }
}

export function layoutCloseView(layout: WorkbenchLayout, viewId: string): WorkbenchLayout {
  const tree = cloneNode(layout.tree)
  unplace(tree, viewId)
  const dismissed = layout.dismissed.includes(viewId)
    ? layout.dismissed
    : [...layout.dismissed, viewId]
  return { version: 2, tree, dismissed }
}

/**
 * 分割：在叶的指定方向插入新叶；viewId 给定时把该视图挪入新叶（并收回 dismissed）。
 * 父枝方向与分割方向一致 → 插为兄弟（权重对半）；否则叶原地升级为枝。
 */
export function layoutSplit(
  layout: WorkbenchLayout,
  leafId: string,
  dir: SplitDir,
  viewId?: string
): WorkbenchLayout {
  if (findLeaf(layout.tree, leafId) == null) return layout
  const tree = cloneNode(layout.tree)
  // 克隆树上的叶（绝不是原树的叶对象——升级为枝时嵌入的必须是克隆，否则视图双份）
  const src = findLeaf(tree, leafId)!
  if (viewId != null) unplace(tree, viewId)
  const newLeaf: WBLeaf = {
    kind: 'leaf',
    id: freshId(tree),
    stack: viewId != null ? [viewId] : [],
    active: viewId ?? null
  }
  const dirRow = dir === 'left' || dir === 'right'
  const parent = findParent(tree, leafId)
  if (parent != null && parent.dir === (dirRow ? 'row' : 'col')) {
    const i = parent.children.findIndex((c) => c.kind === 'leaf' && c.id === leafId)
    const at = dir === 'right' || dir === 'below' ? i + 1 : i
    const w = parent.weights[i] ?? 1
    parent.weights.splice(at, 0, w / 2)
    parent.weights[at === i ? i + 1 : i] = w / 2
    parent.children.splice(at, 0, newLeaf)
  } else {
    const upgraded: WBSplit = {
      kind: 'split',
      id: freshId(tree),
      dir: dirRow ? 'row' : 'col',
      children: dir === 'left' || dir === 'above' ? [newLeaf, src] : [src, newLeaf],
      weights: [1, 1]
    }
    if (parent != null) {
      const i = parent.children.findIndex((c) => c.kind === 'leaf' && c.id === leafId)
      parent.children.splice(i, 1, upgraded)
    } else {
      // 根本身就是该叶：新枝即新根
      return { version: 2, tree: upgraded, dismissed: withoutDismissed(layout, viewId) }
    }
  }
  return { version: 2, tree, dismissed: withoutDismissed(layout, viewId) }
}

function withoutDismissed(layout: WorkbenchLayout, viewId?: string): string[] {
  return viewId != null ? layout.dismissed.filter((id) => id !== viewId) : [...layout.dismissed]
}

/** 关闭槽位：摘叶（其视图全数入 dismissed）；兄弟 absorbs；关掉最后一叶 = 清空该叶（页面至少一槽）。 */
export function layoutCloseLeaf(layout: WorkbenchLayout, leafId: string): WorkbenchLayout {
  const root = layout.tree
  if (root.kind === 'leaf') {
    // 唯一的槽不可摘：清空它（视图入 dismissed）
    const closed = root.stack
    return {
      version: 2,
      tree: { ...root, stack: [], active: null },
      dismissed: [...layout.dismissed, ...closed.filter((id) => !layout.dismissed.includes(id))]
    }
  }
  const tree = cloneNode(root)
  const parent = findParent(tree, leafId)
  if (parent == null) return layout
  const i = parent.children.findIndex((c) => c.kind === 'leaf' && c.id === leafId)
  if (i < 0) return layout
  const [removed] = parent.children.splice(i, 1)
  parent.weights.splice(i, 1)
  const closed = removed != null && removed.kind === 'leaf' ? removed.stack : collectStacks(removed!)
  return {
    version: 2,
    tree: normalizeTree(tree),
    dismissed: [...layout.dismissed, ...closed.filter((id) => !layout.dismissed.includes(id))]
  }
}

/** 调权重：第 index 与 index+1 个兄弟之间转移 delta（每份 ≥ MIN_WEIGHT；总和归一）。 */
export function layoutAdjustWeights(
  layout: WorkbenchLayout,
  splitId: string,
  index: number,
  delta: number
): WorkbenchLayout {
  const split = findSplit(layout.tree, splitId)
  if (split == null || index < 0 || index >= split.weights.length - 1) return layout
  const tree = cloneNode(layout.tree)
  const target = findSplit(tree, splitId)!
  let a = target.weights[index]! + delta
  let b = target.weights[index + 1]! - delta
  if (a < MIN_WEIGHT) {
    b -= MIN_WEIGHT - a
    a = MIN_WEIGHT
  }
  if (b < MIN_WEIGHT) {
    a -= MIN_WEIGHT - b
    b = MIN_WEIGHT
  }
  if (a < MIN_WEIGHT || b < MIN_WEIGHT) return layout
  target.weights[index] = a
  target.weights[index + 1] = b
  const sum = target.weights.reduce((s, w) => s + w, 0)
  target.weights = target.weights.map((w) => w / sum)
  return { ...layout, tree }
}

/** 以给定权重数组直接设置某枝（拖宽松手提交用；非法值拒绝，总和归一）。 */
export function layoutSetWeights(
  layout: WorkbenchLayout,
  splitId: string,
  weights: number[]
): WorkbenchLayout {
  const split = findSplit(layout.tree, splitId)
  if (split == null || weights.length !== split.weights.length) return layout
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!Number.isFinite(sum) || sum <= 0 || weights.some((w) => !Number.isFinite(w) || w < 0)) {
    return layout
  }
  const tree = cloneNode(layout.tree)
  const target = findSplit(tree, splitId)!
  target.weights = weights.map((w) => w / sum)
  return { ...layout, tree }
}

// ── 解析与迁移（坏数据不炸工作台；旧四槽格式 → 等价树） ─────────────────────────

/** v2 形状守门：递归验证节点；坏字段走默认。返回 null = 不像布局。 */
function asV2(stored: unknown): WorkbenchLayout | null {
  if (stored == null || typeof stored !== 'object') return null
  const o = stored as Record<string, unknown>
  if (o.version !== 2 || o.tree == null || !Array.isArray(o.dismissed)) return null
  if (!isValidNode(o.tree)) return null
  return { version: 2, tree: o.tree as WBNode, dismissed: o.dismissed.filter((d): d is string => typeof d === 'string') }
}

function isValidNode(v: unknown): boolean {
  if (v == null || typeof v !== 'object') return false
  const n = v as Record<string, unknown>
  if (n.kind === 'leaf') {
    return typeof n.id === 'string' && Array.isArray(n.stack) && n.stack.every((s) => typeof s === 'string')
  }
  if (n.kind === 'split') {
    return (
      typeof n.id === 'string' &&
      (n.dir === 'row' || n.dir === 'col') &&
      Array.isArray(n.children) &&
      n.children.length >= 1 && // 单子枝合法（normalizeTree 折叠），零子枝不合法
      n.children.every(isValidNode) &&
      Array.isArray(n.weights) &&
      n.weights.length === n.children.length &&
      n.weights.every((w) => typeof w === 'number' && Number.isFinite(w) && w >= 0)
    )
  }
  return false
}

/** v2 内容归一：未知/重复视图剔除、active 修正、权重归一、单子枝折叠。 */
function normalizeLayout(layout: WorkbenchLayout, knownIds: ReadonlySet<string>): WorkbenchLayout {
  const tree = cloneNode(layout.tree)
  const seen = new Set<string>()
  walkLeaves(tree, (leaf) => {
    const kept: string[] = []
    for (const id of leaf.stack) {
      if (!knownIds.has(id) || seen.has(id)) continue
      seen.add(id)
      kept.push(id)
    }
    leaf.stack = kept
    leaf.active = leaf.active != null && kept.includes(leaf.active) ? leaf.active : (kept[0] ?? null)
  })
  const normalized = normalizeTree(tree)
  const dismissed = [...new Set(layout.dismissed.filter((id) => knownIds.has(id)))]
  return { version: 2, tree: normalized, dismissed }
}

/** 旧四槽格式迁移：非空栈 → 等价树（row[左?, col[中, 底]?, 右?]）；旧尺寸不迁移（像素权重换算不值当）。 */
function migrateV1(old: {
  slots?: Partial<Record<DetailSlotId, unknown>>
  dismissed?: unknown
}): WorkbenchLayout | null {
  const stackOf = (slot: DetailSlotId): string[] => {
    const v = old.slots?.[slot]
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
  }
  const dismissed = Array.isArray(old.dismissed)
    ? old.dismissed.filter((d): d is string => typeof d === 'string')
    : []
  const stacks = {
    left: stackOf('left'),
    center: stackOf('center'),
    right: stackOf('right'),
    bottom: stackOf('bottom')
  }
  if (!stacks.center.length && !stacks.right.length && !stacks.bottom.length && !stacks.left.length) {
    return null
  }
  const leaf = (id: string, stack: string[]): WBLeaf => ({ kind: 'leaf', id, stack, active: stack[0] ?? null })
  const parts: WBNode[] = [leaf('s1', stacks.center)]
  if (stacks.bottom.length) parts.push(leaf('s2', stacks.bottom))
  const main: WBNode =
    parts.length === 1
      ? parts[0]!
      : { kind: 'split', id: 's3', dir: 'col', children: parts, weights: parts.map(() => 1 / parts.length) }
  const row: WBNode[] = []
  if (stacks.left.length) row.push(leaf('s4', stacks.left))
  row.push(main)
  if (stacks.right.length) row.push(leaf('s5', stacks.right))
  return { version: 2, tree: rowify(row), dismissed }
}

/**
 * 分配解析（D41 最后一环）。规则：
 * - v2 存储 → 归一（未知剔除/去重/active 修正/权重归一/单子枝折叠）；
 * - 旧四槽存储 → 迁移为等价树；
 * - 无/坏存储 → 出厂；
 * - 已注册但无处安身且未被关闭的视图 → 空叶优先，否则按偏好方向分割新叶（无偏好/center → 第一个叶）；
 *   dismissed 不回落（以用户为准）。
 */
export function resolveLayout(stored: unknown, known: readonly KnownView[]): WorkbenchLayout {
  const knownIds = new Set(known.map((v) => v.id))
  let layout: WorkbenchLayout | null = null
  const v2 = asV2(stored)
  if (v2 != null) {
    layout = normalizeLayout(v2, knownIds)
  } else if (stored != null && typeof stored === 'object' && (stored as Record<string, unknown>).slots != null) {
    layout = migrateV1(stored as Parameters<typeof migrateV1>[0])
    if (layout != null) layout = normalizeLayout(layout, knownIds)
  }
  if (layout == null) {
    layout = defaultLayout(known)
    // 出厂也过一遍已知过滤（known 为空时给一个空中心叶）
  }
  assignMissing(layout, known, knownIds)
  return layout
}

/** 无处安身的已注册视图（未 dismissed）：空叶优先 → 偏好方向分割新叶 → 第一个叶。 */
function assignMissing(layout: WorkbenchLayout, known: readonly KnownView[], knownIds: ReadonlySet<string>): void {
  const placed = new Set(collectStacks(layout.tree))
  for (const view of known) {
    if (!knownIds.has(view.id) || placed.has(view.id) || layout.dismissed.includes(view.id)) continue
    const emptyLeaf = firstEmptyLeaf(layout.tree)
    if (emptyLeaf != null) {
      emptyLeaf.stack.push(view.id)
      emptyLeaf.active = view.id
      placed.add(view.id)
      continue
    }
    const pref = view.preferredSlot
    if (pref === 'left' || pref === 'right' || pref === 'bottom') {
      const dir: SplitDir = pref === 'bottom' ? 'below' : pref
      const anchorLeaf = pref === 'left' ? firstLeaf(layout.tree) : lastLeaf(layout.tree)
      const next = layoutSplit(layout, anchorLeaf.id, dir, view.id)
      layout.tree = next.tree
      placed.add(view.id)
      continue
    }
    // 无偏好 / center → 第一个叶
    const first = firstLeaf(layout.tree)
    first.stack.push(view.id)
    if (first.active == null) first.active = view.id
    placed.add(view.id)
  }
}

function firstLeaf(node: WBNode): WBLeaf {
  return node.kind === 'leaf' ? node : firstLeaf(node.children[0]!)
}

function lastLeaf(node: WBNode): WBLeaf {
  return node.kind === 'leaf' ? node : lastLeaf(node.children[node.children.length - 1]!)
}

function firstEmptyLeaf(node: WBNode): WBLeaf | null {
  if (node.kind === 'leaf') return node.stack.length === 0 ? node : null
  for (const c of node.children) {
    const hit = firstEmptyLeaf(c)
    if (hit) return hit
  }
  return null
}
