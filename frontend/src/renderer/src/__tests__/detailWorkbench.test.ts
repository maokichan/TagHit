/**
 * 详情页工作台槽位规则断言（D39）。
 * 钉住分配解析的裁决口径：出厂按偏好落位 / 用户覆盖为准 / 已注销视图剔除 /
 * 已知无归宿视图回落（dismissed 不回落）/ active 修正 / 尺寸 clamp。
 */
import { describe, expect, it } from 'vitest'
import {
  activateView,
  closeView,
  clampSlotSize,
  moveView,
  resetLayout,
  resolveLayout,
  setSlotSize,
  SLOT_SIZE_BOUNDS,
  type KnownView,
  type WorkbenchLayout
} from '../features/detailWorkbench/slots'

const KNOWN: KnownView[] = [
  { id: 'preview', preferredSlot: 'center' },
  { id: 'info', preferredSlot: 'right' },
  { id: 'filmstrip', preferredSlot: 'bottom' },
  { id: 'plugin.panel', preferredSlot: 'left' },
  { id: 'plugin.naked' } // 无偏好 → 右栏
]

/** 已知视图按偏好落位的出厂形态。 */
function expectFactory(layout: WorkbenchLayout): void {
  expect(layout.slots.center).toEqual(['preview'])
  expect(layout.slots.right).toEqual(['info', 'plugin.naked'])
  expect(layout.slots.bottom).toEqual(['filmstrip'])
  expect(layout.slots.left).toEqual(['plugin.panel'])
  expect(layout.active).toEqual({ left: 'plugin.panel', center: 'preview', right: 'info', bottom: 'filmstrip' })
}

describe('resolveLayout', () => {
  it('无存储（null）→ 出厂：全部已知视图按偏好落位，注册序 = tab 序', () => {
    expectFactory(resolveLayout(null, KNOWN))
  })

  it('存储损坏（非对象/缺 slots）→ 出厂', () => {
    expectFactory(resolveLayout('garbage', KNOWN))
    expectFactory(resolveLayout(42, KNOWN))
    expectFactory(resolveLayout({ nope: 1 }, KNOWN))
  })

  it('用户覆盖为准：存储的栈序、active、尺寸原样保留', () => {
    const stored = {
      slots: { center: ['info'], right: ['preview'], bottom: [], left: [] },
      active: { center: 'info', right: 'preview', bottom: null, left: null },
      sizes: { leftW: 300, rightW: 400, bottomH: 200 },
      dismissed: []
    }
    const layout = resolveLayout(stored, KNOWN)
    expect(layout.slots.center).toEqual(['info'])
    expect(layout.active.center).toBe('info')
    expect(layout.sizes).toEqual({ leftW: 300, rightW: 400, bottomH: 200 })
    // 未安置的已知视图（filmstrip / plugin.*）按偏好回落
    expect(layout.slots.bottom).toEqual(['filmstrip'])
    expect(layout.slots.left).toEqual(['plugin.panel'])
    // plugin.naked 未安置也未 dismiss → 回落右栏（追加在用户栈之后）
    expect(layout.slots.right).toEqual(['preview', 'plugin.naked'])
  })

  it('已注销视图（不在 known）从栈与 dismissed 中剔除', () => {
    const stored = {
      slots: { center: ['preview', 'ghost.plugin'], right: [], bottom: [], left: [] },
      active: { center: 'ghost.plugin', right: null, bottom: null, left: null },
      dismissed: ['ghost.plugin', 'gone.too']
    }
    const layout = resolveLayout(stored, KNOWN)
    expect(layout.slots.center).toEqual(['preview'])
    expect(layout.active.center).toBe('preview') // active 指向鬼视图 → 修正为栈首
    expect(layout.dismissed).toEqual([])
  })

  it('用户主动关闭（dismissed）的已知视图不回落——以用户为准', () => {
    const stored = {
      slots: { center: ['preview'], right: ['info'], bottom: [], left: [] },
      active: { center: 'preview', right: 'info', bottom: null, left: null },
      dismissed: ['filmstrip']
    }
    const layout = resolveLayout(stored, KNOWN)
    expect(layout.slots.bottom).toEqual([])
    expect(layout.active.bottom).toBeNull()
    expect(layout.dismissed).toEqual(['filmstrip'])
  })

  it('存储尺寸越界 → clamp；非数值 → 回默认', () => {
    const stored = {
      slots: { center: ['preview'], right: ['info'], bottom: ['filmstrip'], left: [] },
      active: { center: 'preview', right: 'info', bottom: 'filmstrip', left: null },
      sizes: { leftW: 9999, rightW: 1, bottomH: 'bogus' }
    }
    const layout = resolveLayout(stored, KNOWN)
    expect(layout.sizes.leftW).toBe(clampSlotSize('leftW', 9999))
    expect(layout.sizes.rightW).toBe(clampSlotSize('rightW', 1))
    expect(layout.sizes.bottomH).toBe(clampSlotSize('bottomH', NaN)) // 回默认
  })

  it('栈内重复 id 去重（脏存储不复制标签）', () => {
    const stored = {
      slots: { center: ['preview', 'preview'], right: [], bottom: [], left: [] },
      active: { center: 'preview', right: null, bottom: null, left: null }
    }
    const layout = resolveLayout(stored, KNOWN)
    expect(layout.slots.center).toEqual(['preview'])
  })
})

describe('布局操作', () => {
  const factory = (): WorkbenchLayout =>
    resolveLayout(null, [
      { id: 'preview', preferredSlot: 'center' },
      { id: 'info', preferredSlot: 'right' },
      { id: 'filmstrip', preferredSlot: 'bottom' }
    ])

  it('moveView：跨槽移动 = 原槽移除 + 目标栈尾 + 激活；原槽 active 修正', () => {
    const next = moveView(factory(), 'info', 'bottom')
    expect(next.slots.right).toEqual([])
    expect(next.active.right).toBeNull()
    expect(next.slots.bottom).toEqual(['filmstrip', 'info'])
    expect(next.active.bottom).toBe('info')
    // 纯函数：原布局不受影响
    expect(factory().slots.right).toEqual(['info'])
  })

  it('moveView：把 dismissed 的视图重新安置 = 收回关闭记录', () => {
    const closed = closeView(factory(), 'filmstrip')
    expect(closed.dismissed).toEqual(['filmstrip'])
    const readded = moveView(closed, 'filmstrip', 'left')
    expect(readded.slots.left).toEqual(['filmstrip'])
    expect(readded.dismissed).toEqual([])
  })

  it('moveView：目标 = 原槽（同槽拖放）→ 移到栈尾（等效重排尾位），无副作用炸裂', () => {
    const layout = factory()
    const next = moveView(layout, 'preview', 'center')
    expect(next.slots.center).toEqual(['preview'])
    expect(next.active.center).toBe('preview')
  })

  it('closeView：出栈 + 入 dismissed；active 修正为栈首', () => {
    const layout = factory()
    layout.slots.right = ['info', 'extra']
    layout.active.right = 'info'
    const next = closeView(layout, 'info')
    expect(next.slots.right).toEqual(['extra'])
    expect(next.active.right).toBe('extra')
    expect(next.dismissed).toEqual(['info'])
  })

  it('activateView：仅当视图在本槽栈内才生效', () => {
    const layout = factory()
    expect(activateView(layout, 'right', 'preview')).toBe(layout) // 不在右栏 → 原样返回
    const next = activateView(layout, 'center', 'preview')
    expect(next.active.center).toBe('preview')
  })

  it('setSlotSize：clamp 后写入', () => {
    const next = setSlotSize(factory(), 'rightW', 8000)
    expect(next.sizes.rightW).toBe(clampSlotSize('rightW', 8000))
  })

  it('resetLayout：清 dismissed、按偏好重排、尺寸回默认', () => {
    const dirty = closeView(moveView(factory(), 'info', 'center'), 'filmstrip')
    dirty.sizes.rightW = 460
    const fresh = resetLayout([
      { id: 'preview', preferredSlot: 'center' },
      { id: 'info', preferredSlot: 'right' },
      { id: 'filmstrip', preferredSlot: 'bottom' }
    ])
    expect(fresh.slots.center).toEqual(['preview'])
    expect(fresh.slots.right).toEqual(['info'])
    expect(fresh.slots.bottom).toEqual(['filmstrip'])
    expect(fresh.dismissed).toEqual([])
    expect(fresh.sizes.rightW).toBe(clampSlotSize('rightW', NaN)) // 默认
  })

  it('seedSizes：首读播种（旧右栏宽迁移）', () => {
    const layout = resolveLayout(null, KNOWN, { rightW: 333 })
    expect(layout.sizes.rightW).toBe(333)
  })
})

describe('clampSlotSize', () => {
  it('三向边界 + 非有限值回默认', () => {
    expect(clampSlotSize('rightW', 100)).toBe(220)
    expect(clampSlotSize('rightW', 5000)).toBe(460)
    expect(clampSlotSize('rightW', 300.6)).toBe(301)
    expect(clampSlotSize('bottomH', NaN)).toBe(SLOT_SIZE_BOUNDS.bottomH.default)
    expect(clampSlotSize('leftW', Infinity)).toBe(SLOT_SIZE_BOUNDS.leftW.default)
  })
})
