/**
 * 图片缩放纯几何的断言（D30：渲染层纯规则可被测试直跑）。
 * 核心不变式：**锚点下的内容点在缩放前后渲染在同一屏幕位置**——
 * 那是"光标为锚"的全部意义，坏了就是"滚轮一转图乱飞"。
 * 另一条口径：**缩小方向的终点是适应窗口**——scale 落到 1（含缩过头）一律平移归零。
 */

import { describe, expect, it } from 'vitest'
import { FIT, MAX_SCALE, MIN_SCALE, anchorZoom, pan, wheelFactor } from '../features/imageZoom'

function state(scale: number, tx: number, ty: number) {
  return { scale, tx, ty }
}

describe('锚点缩放', () => {
  it('锚点下的内容点渲染位置不动（含已有变换与钳到上界的状态）', () => {
    const prevs = [state(1, 0, 0), state(2.5, -180, 40), state(MAX_SCALE, 500, -200)]
    const anchors = [[120, 80], [0, 0], [640, 400], [-50, 900]] as const
    // 只取"变换真实发生"的因子：落到 1 的情形由专门断言管（那里按定义回 FIT）
    for (const prev of prevs) {
      for (const factor of [1.2, 0.8, 4]) {
        if (prev.scale * factor <= MIN_SCALE) continue
        for (const [ax, ay] of anchors) {
          const next = anchorZoom(prev, ax, ay, factor)
          // 锚点相对"渲染后左上角"度量 → 光标下的内容点 p = anchor / s；
          // 不变式（相对布局原点）：t' + p·s' === t + anchor（同一屏幕点）
          const px = ax / prev.scale
          const py = ay / prev.scale
          expect(next.tx + px * next.scale).toBeCloseTo(prev.tx + ax, 6)
          expect(next.ty + py * next.scale).toBeCloseTo(prev.ty + ay, 6)
        }
      }
    }
  })

  it('scale 钳制：放大不过 MAX，缩小不过适应窗口（缩过头 = 回 FIT）', () => {
    expect(anchorZoom(FIT, 100, 100, 100).scale).toBe(MAX_SCALE)
    expect(anchorZoom(state(4, 10, 10), 100, 100, 0.01)).toEqual(FIT)
    expect(anchorZoom(FIT, 100, 100, 0.5)).toEqual(FIT)
  })

  it('缩回 1 即回适应窗口（平移归零）——画面丢不出去', () => {
    expect(anchorZoom(state(1.5, -220, 60), 100, 100, 2 / 3)).toEqual(FIT)
  })

  it('平移只叠加位移，scale 不变', () => {
    expect(pan(state(2, 10, -10), -30, 5)).toEqual(state(2, -20, -5))
  })
})

describe('滚轮增量', () => {
  it('一格刻度 ≈ ×1.2，向下滚放大（deltaY 负 → 因子 >1）', () => {
    expect(wheelFactor(-100)).toBeCloseTo(1.197, 2)
    expect(wheelFactor(100)).toBeCloseTo(1 / 1.197, 2)
    expect(wheelFactor(0)).toBe(1)
  })
})
