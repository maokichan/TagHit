/**
 * 窗口内定位与邻居的断言。
 *
 * 守的是实机 bug：**窗口是切片（起点 from），index 是序列位置**——
 * 拿 index 直接索引切片，只在前 radius+1 张对，之后跳张、再往后越界（方向键失效）。
 */

import { describe, expect, it } from 'vitest'
import { windowNav } from '../features/windowNav'

const RADIUS = 6
const WINDOW = 2 * RADIUS + 1 // 13

/** 造一个"序列里第 index 条、窗口半径 6"的切片（与用例 itemWindow 的取法一致）。 */
function sliceAt(index: number, total = 100): { index: number; from: number; count: number } {
  const from = Math.max(0, index - RADIUS)
  const count = Math.min(total, index + RADIUS + 1) - from
  return { index, from, count }
}

describe('顺序窗口的内定位与邻居', () => {
  it('序列开头（from = 0）：切片位置恰好等于序列位置', () => {
    expect(windowNav(sliceAt(0))).toEqual({ at: 0, prev: null, next: 1 })
    expect(windowNav(sliceAt(3))).toEqual({ at: 3, prev: 2, next: 4 })
  })

  it('序列中段（from = index − radius）：**邻居必须是相邻的，不能跳张**', () => {
    // 第 14 条（0 起 13）：切片起点 7 → 切片位置 6，前一/后一 = 5 / 7
    expect(windowNav(sliceAt(13))).toEqual({ at: 6, prev: 5, next: 7 })
    // 对照：旧实现用 index ± 1 = 12 / 14 → 越界（切片只有 13 项）→ 翻页失效
    const old = sliceAt(13)
    expect(old.index + 1).toBeGreaterThanOrEqual(old.count)
  })

  it('逐张前进：任意位置的"下一张"都恰好是序列里的下一条', () => {
    for (let index = 0; index < 40; index++) {
      const win = sliceAt(index)
      const nav = windowNav(win)
      expect(nav.at).toBe(index - win.from)
      // 下一张：切片位置 +1 对应序列位置 +1（不是 index + 1 直接当切片下标）
      if (nav.next != null) {
        expect(win.from + nav.next).toBe(index + 1)
      } else {
        expect(index).toBe(win.count - 1) // 只有序列末尾才允许没有下一张
      }
      // 上一张同理
      if (nav.prev != null) {
        expect(win.from + nav.prev).toBe(index - 1)
      } else {
        expect(index).toBe(0)
      }
    }
  })

  it('序列尾部：切片被截断时"下一张"才是 null（不能因为越界而失效）', () => {
    const last = sliceAt(99, 100) // 最后一条：切片被截断到 7 项，锚条目正好在末尾
    expect(windowNav(last)).toEqual({ at: 6, prev: 5, next: null })
    const nearLast = sliceAt(97, 100) // 倒数第三条：切片同样被截断，但**仍然有下一张**
    expect(windowNav(nearLast).next).not.toBeNull()
    expect(windowNav(nearLast).at).toBe(nearLast.index - nearLast.from)
  })

  it('锚条目不在序列内（index = -1 / 空切片）：没有可导航的邻居', () => {
    expect(windowNav({ index: -1, from: 0, count: 0 })).toEqual({ at: -1, prev: null, next: null })
    expect(windowNav(null)).toEqual({ at: -1, prev: null, next: null })
    expect(windowNav({ index: 5, from: 0, count: 0 })).toEqual({ at: -1, prev: null, next: null })
    // 数据不一致（index 落在切片之外，如 from/count 与 index 不匹配）也不能乱给邻居
    expect(windowNav({ index: 25, from: 8, count: 13 })).toEqual({ at: -1, prev: null, next: null })
  })

  it('窗口长度符合"锚条目 ± radius"（供流水条与邻居判断共用）', () => {
    expect(WINDOW).toBe(2 * RADIUS + 1)
    expect(sliceAt(50).count).toBe(WINDOW)
  })
})
