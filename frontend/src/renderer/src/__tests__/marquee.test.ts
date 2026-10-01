/**
 * 框选（拖拽多选）的几何与意图断言。
 *
 * 守两条：
 * ① **命中判定是纯规则**（D30）：坐标一律视口坐标，与三种布局算法的内边距/滚动无关——
 *    这正是不去重算布局的原因，所以这里逐条钉住矩形语义（反向拖、贴边、阈值）；
 * ② **意图在壳**：裸拖替换、Ctrl/Cmd+拖并入（D35），组件不自己解释修饰键。
 */

import { describe, expect, it } from 'vitest'
import {
  collectCardRects,
  hitIds,
  intersects,
  isDragGesture,
  rectBetween,
  type CardRect
} from '../features/marquee'
import { marqueeIntentOf } from '../features/selection'

function mouse(mods: Partial<Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}): MouseEvent {
  return {
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
    shiftKey: mods.shiftKey ?? false
  } as MouseEvent
}

describe('框选几何', () => {
  it('两点成矩形：反向拖（右下 → 左上）也得到正矩形', () => {
    expect(rectBetween(10, 20, 40, 60)).toEqual({ x: 10, y: 20, w: 30, h: 40 })
    expect(rectBetween(40, 60, 10, 20)).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })

  it('贴合算相交（用户看到框住了就是框住了），分离不算', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    expect(intersects(a, { x: 10, y: 10, w: 5, h: 5 })).toBe(true) // 角贴角
    expect(intersects(a, { x: 10.5, y: 0, w: 5, h: 5 })).toBe(false)
    expect(intersects(a, { x: 2, y: 2, w: 1, h: 1 })).toBe(true) // 完全内含
  })

  it('命中集合保持传入顺序（调用方据此保持视图顺序），未命中的不出现', () => {
    const cards: CardRect[] = [
      { id: 'a', rect: { x: 0, y: 0, w: 10, h: 10 } },
      { id: 'b', rect: { x: 100, y: 100, w: 10, h: 10 } },
      { id: 'c', rect: { x: 5, y: 5, w: 10, h: 10 } }
    ]
    expect(hitIds({ x: 0, y: 0, w: 12, h: 12 }, cards)).toEqual(['a', 'c'])
    expect(hitIds({ x: 200, y: 200, w: 5, h: 5 }, cards)).toEqual([])
  })

  it('阈值：手抖不算框选，超过 4px 才算（裸点击仍是"点空白清空选择"）', () => {
    expect(isDragGesture(1, 2)).toBe(false)
    expect(isDragGesture(4, 0)).toBe(true)
    expect(isDragGesture(0, -5)).toBe(true)
  })

  it('卡片位置只认 data-ctx-id（与右键菜单/拖拽同一份 DOM 契约）', () => {
    const el = (id: string | undefined, rect: [number, number, number, number]) => ({
      dataset: id == null ? {} : { ctxId: id },
      getBoundingClientRect: () => ({ left: rect[0], top: rect[1], width: rect[2], height: rect[3] })
    })
    const container = {
      querySelectorAll: () => [el('i1', [0, 0, 10, 10]), el(undefined, [0, 0, 10, 10]), el('i2', [50, 50, 10, 10])]
    } as unknown as ParentNode
    expect(collectCardRects(container)).toEqual([
      { id: 'i1', rect: { x: 0, y: 0, w: 10, h: 10 } },
      { id: 'i2', rect: { x: 50, y: 50, w: 10, h: 10 } }
    ])
  })
})

describe('框选意图（壳级：修饰键 → 意图）', () => {
  it('裸拖 = 替换选择', () => {
    expect(marqueeIntentOf(mouse())).toBe('replace')
    expect(marqueeIntentOf(mouse({ shiftKey: true }))).toBe('replace')
  })

  it('Ctrl/Cmd+拖 = 并入已有选择（跨平台同一语义）', () => {
    expect(marqueeIntentOf(mouse({ ctrlKey: true }))).toBe('add')
    expect(marqueeIntentOf(mouse({ metaKey: true }))).toBe('add')
  })
})
