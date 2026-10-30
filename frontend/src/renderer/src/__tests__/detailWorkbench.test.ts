/**
 * 详情页工作台布局规则断言（D41 分割树）。
 * 钉住：默认树形状 / v1 四槽迁移 / v2 序列化往返 / 树操作（分割·关闭·移动·权重）/
 * 别名陷阱（split 嵌入克隆叶）/ 回落规则（空叶优先、偏好方向、dismissed 不回落）。
 */
import { describe, expect, it } from 'vitest'
import {
  layoutActivate,
  layoutAdjustWeights,
  layoutCloseLeaf,
  layoutCloseView,
  layoutMoveView,
  layoutSplit,
  resolveLayout,
  type KnownView,
  type WBLeaf,
  type WorkbenchLayout
} from '../features/detailWorkbench/slots'

const KNOWN: KnownView[] = [
  { id: 'preview', preferredSlot: 'center' },
  { id: 'info', preferredSlot: 'right' },
  { id: 'filmstrip', preferredSlot: 'bottom' }
]

function leafOf(layout: WorkbenchLayout, id: string): WBLeaf {
  const found = findLeafById(layout.tree, id)
  expect(found).not.toBeNull()
  return found!
}

function findLeafById(node: WorkbenchLayout['tree'], id: string): WBLeaf | null {
  if (node.kind === 'leaf') return node.id === id ? node : null
  for (const c of node.children) {
    const hit = findLeafById(c, id)
    if (hit) return hit
  }
  return null
}

/** 出厂树形：row[ col[s1(预览), s2(预览条)], s5(信息) ]。 */
function expectFactory(layout: WorkbenchLayout): void {
  expect(layout.version).toBe(2)
  expect(layout.tree.kind).toBe('split')
  const root = layout.tree as { dir: string; children: WorkbenchLayout['tree'][] }
  expect(root.dir).toBe('row')
  const [main, right] = root.children
  expect(leafOf(layout, right!.id).stack).toEqual(['info'])
  expect(main!.kind).toBe('split')
  const col = main as { dir: string; children: WorkbenchLayout['tree'][] }
  expect(col.dir).toBe('col')
  expect(leafOf(layout, col.children[0]!.id).stack).toEqual(['preview'])
  expect(leafOf(layout, col.children[1]!.id).stack).toEqual(['filmstrip'])
}

describe('resolveLayout / 默认树', () => {
  it('无存储 → 出厂：偏好落位成默认树', () => {
    expectFactory(resolveLayout(null, KNOWN))
  })

  it('存储损坏 → 出厂', () => {
    expectFactory(resolveLayout('garbage', KNOWN))
    expectFactory(resolveLayout({ version: 2, tree: { kind: 'nope' } }, KNOWN))
    expectFactory(resolveLayout({ slots: {} }, KNOWN)) // v1 全空 → 出厂
  })

  it('v1 四槽存储 → 迁移为等价树（空左槽不注入）', () => {
    const old = {
      slots: {
        left: [],
        center: ['preview'],
        right: ['info'],
        bottom: ['filmstrip']
      },
      active: { center: 'preview', right: 'info', bottom: 'filmstrip', left: null },
      sizes: { leftW: 260, rightW: 288, bottomH: 144 },
      dismissed: []
    }
    expectFactory(resolveLayout(old, KNOWN))
  })

  it('v1 非空左槽 → 树含左叶', () => {
    const old = {
      slots: { left: ['x'], center: [], right: [], bottom: [] },
      dismissed: []
    }
    const layout = resolveLayout(old, [{ id: 'x' }])
    const root = layout.tree as { dir: string; children: WorkbenchLayout['tree'][] }
    expect(root.dir).toBe('row')
    expect(leafOf(layout, root.children[0]!.id).stack).toEqual(['x'])
  })

  it('v2 往返：布局 → JSON → resolve 深度一致', () => {
    const original = resolveLayout(null, KNOWN)
    const round = resolveLayout(JSON.parse(JSON.stringify(original)), KNOWN)
    expect(round).toEqual(original)
  })

  it('v2 归一：未知视图剔除、重复去重、active 修正', () => {
    const stored = {
      version: 2,
      tree: {
        kind: 'leaf',
        id: 's1',
        stack: ['preview', 'preview', 'ghost'],
        active: 'ghost'
      },
      dismissed: ['ghost']
    }
    const layout = resolveLayout(stored, KNOWN)
    const leaf = leafOf(layout, 's1')
    expect(leaf.stack).toEqual(['preview'])
    expect(leaf.active).toBe('preview')
    // 未安置的已知视图回落（空叶优先 → 没有空叶 → info/filmstrip 落 s1 后？不：无偏好方向 → 第一个叶）
    expect(layout.dismissed).toEqual([])
  })

  it('v2 单子枝折叠（其余视图已 dismissed，不再回落长枝）', () => {
    const stored = {
      version: 2,
      tree: {
        kind: 'split',
        id: 's9',
        dir: 'row',
        children: [{ kind: 'leaf', id: 's1', stack: ['preview'], active: 'preview' }],
        weights: [1]
      },
      dismissed: ['info', 'filmstrip']
    }
    const layout = resolveLayout(stored, KNOWN)
    expect(layout.tree.kind).toBe('leaf')
    expect(leafOf(layout, 's1').stack).toEqual(['preview'])
  })
})

describe('回落规则', () => {
  it('新注册视图：空叶优先', () => {
    let layout = resolveLayout(null, KNOWN)
    layout = layoutCloseView(layout, 'filmstrip') // 底叶变空（保留）
    layout = resolveLayout(JSON.parse(JSON.stringify(layout)), [
      ...KNOWN,
      { id: 'plugin.x', preferredSlot: 'bottom' }
    ])
    // filmstrip 被 dismissed 不回落；plugin.x 偏好 bottom → 空叶优先落 s2
    expect(leafOf(layout, 's2').stack).toEqual(['plugin.x'])
    expect(layout.dismissed).toEqual(['filmstrip'])
  })

  it('新注册视图：有存储但缺视图 → 空叶优先，无空叶则按偏好方向分割新叶（right = 最右叶右侧）', () => {
    const stored = resolveLayout(null, KNOWN) // 出厂树不含 plugin.x
    const layout = resolveLayout(JSON.parse(JSON.stringify(stored)), [
      ...KNOWN,
      { id: 'plugin.x', preferredSlot: 'right' }
    ])
    const root = layout.tree as { children: WorkbenchLayout['tree'][] }
    expect(root.children.length).toBe(3)
    expect(leafOf(layout, root.children[2]!.id).stack).toEqual(['plugin.x'])
    // 出厂（无存储）时全部已知视图按偏好直接排入默认树，不走分割
    expect(leafOf(resolveLayout(null, [...KNOWN, { id: 'plugin.x', preferredSlot: 'right' }]), 's5').stack).toEqual([
      'info',
      'plugin.x'
    ])
  })

  it('dismissed 不回落；用户覆盖（v2 栈序）为准', () => {
    const stored = {
      version: 2,
      tree: {
        kind: 'split',
        id: 's3',
        dir: 'row',
        children: [
          { kind: 'leaf', id: 's1', stack: ['info'], active: 'info' },
          { kind: 'leaf', id: 's2', stack: ['preview'], active: 'preview' }
        ],
        weights: [0.5, 0.5]
      },
      dismissed: ['filmstrip']
    }
    const layout = resolveLayout(stored, KNOWN)
    expect(leafOf(layout, 's1').stack).toEqual(['info'])
    expect(leafOf(layout, 's2').stack).toEqual(['preview'])
    expect(layout.dismissed).toEqual(['filmstrip'])
  })
})

describe('树操作', () => {
  const factory = (): WorkbenchLayout => resolveLayout(null, KNOWN)

  it('layoutMoveView：跨叶移动 + 收回 dismissed；原叶 active 修正', () => {
    const moved = layoutMoveView(factory(), 'info', 's1')
    expect(leafOf(moved, 's1').stack).toEqual(['preview', 'info'])
    expect(leafOf(moved, 's1').active).toBe('info')
    expect(leafOf(moved, 's5').stack).toEqual([])
    const closed = layoutCloseView(moved, 'info')
    expect(closed.dismissed).toEqual(['info'])
    const back = layoutMoveView(closed, 'info', 's5')
    expect(back.dismissed).toEqual([])
    expect(leafOf(back, 's5').stack).toEqual(['info'])
  })

  it('layoutSplit：同向父枝 → 插为兄弟（权重对半）；视图挪入新叶且不双份', () => {
    // s5（信息）向右分割并带走 preview：preview 从 s1 摘除、只在新叶
    const next = layoutSplit(factory(), 's5', 'right', 'preview')
    const root = next.tree as { children: WorkbenchLayout['tree'][]; weights: number[] }
    expect(root.children.length).toBe(3)
    // 全树恰有一份 preview（不双份）：s1 空了，s6 持有
    expect(leafOf(next, 's1').stack).toEqual([])
    expect(leafOf(next, 's6').stack).toEqual(['preview'])
    expect(leafOf(next, 's5').stack).toEqual(['info'])
    expect(root.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('layoutSplit：根是叶 → 升级为新枝（新根）', () => {
    const single: WorkbenchLayout = {
      version: 2,
      tree: { kind: 'leaf', id: 's1', stack: ['preview'], active: 'preview' },
      dismissed: []
    }
    const next = layoutSplit(single, 's1', 'below', 'info')
    expect(next.tree.kind).toBe('split')
    const root = next.tree as { dir: string; children: WorkbenchLayout['tree'][] }
    expect(root.dir).toBe('col')
    expect(leafOf(next, root.children[0]!.id).stack).toEqual(['preview'])
    expect(leafOf(next, root.children[1]!.id).stack).toEqual(['info'])
  })

  it('layoutSplit：空分割（不带视图）→ 新空叶', () => {
    const next = layoutSplit(factory(), 's5', 'below')
    const root = next.tree as { children: WorkbenchLayout['tree'][] }
    const last = root.children[1] as { kind: string; children?: WorkbenchLayout['tree'][] }
    expect(last.kind).toBe('split')
  })

  it('layoutCloseLeaf：摘叶兄弟 absorbs（单子枝折叠）；视图入 dismissed', () => {
    const next = layoutCloseLeaf(factory(), 's5') // 关掉信息叶
    expect(findLeafById(next.tree, 's5')).toBeNull()
    expect(next.dismissed).toEqual(['info'])
    // col[预览, 底] 成为整树（row 折叠消失）
    expect(next.tree.kind).toBe('split')
    const root = next.tree as { dir: string }
    expect(root.dir).toBe('col')
  })

  it('layoutCloseLeaf：唯一的叶不可摘 → 清空', () => {
    const single: WorkbenchLayout = {
      version: 2,
      tree: { kind: 'leaf', id: 's1', stack: ['preview'], active: 'preview' },
      dismissed: []
    }
    const next = layoutCloseLeaf(single, 's1')
    expect(next.tree.kind).toBe('leaf')
    expect(leafOf(next, 's1').stack).toEqual([])
    expect(next.dismissed).toEqual(['preview'])
  })

  it('layoutCloseView：摘出 + dismissed；active 修正为栈首', () => {
    const layout = factory()
    layout.tree = JSON.parse(JSON.stringify(layout.tree))
    const moved = layoutMoveView(layout, 'info', 's1')
    const next = layoutCloseView(moved, 'info')
    expect(leafOf(next, 's1').stack).toEqual(['preview'])
    expect(next.dismissed).toEqual(['info'])
  })

  it('layoutActivate：仅当视图在本叶栈内', () => {
    const layout = factory()
    expect(layoutActivate(layout, 's1', 'info')).toBe(layout)
    expect(layoutActivate(layout, 's1', 'preview').tree).not.toBe(layout.tree)
  })

  it('layoutAdjustWeights：转移 + 双侧 clamp + 归一', () => {
    const layout = factory()
    const root = layout.tree as { id: string; weights: number[] }
    const next = layoutAdjustWeights(layout, root.id, 0, 0.4)
    const w = (next.tree as { weights: number[] }).weights
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(Math.min(...w)).toBeGreaterThanOrEqual(0.05)
    // 极限 delta：不越下限（返回 clamp 后布局）
    const extreme = layoutAdjustWeights(layout, root.id, 0, 10)
    const w2 = (extreme.tree as { weights: number[] }).weights
    expect(Math.min(...w2)).toBeGreaterThanOrEqual(0.05)
  })
})
