/**
 * 顺序窗口的**内定位与邻居**（纯函数）。
 *
 * 这里踩过一个大坑：窗口是"锚条目 ± radius"的**切片**，而 `index` 是锚条目在**整条序列**里的位置。
 * 拿 `index` 直接索引 `items` 只在前 `radius+1` 张碰巧对（那时切片起点 from = 0），
 * 之后会挑错条目（跳张），再往后直接越界（翻页失效）——实机症状：
 * "前十张正常，然后跳到第十四张，之后方向键没反应"。
 * 规则只有一条：**切片位置 = index − from**。
 *
 * 测试：src/renderer/src/__tests__/windowNav.test.ts
 */

export interface WindowSlice {
  /** 锚条目在序列里的 0 起位置（-1 = 不在序列内）。 */
  index: number
  /** 切片第一项在序列里的 0 起位置。 */
  from: number
  /** 切片条目数。 */
  count: number
}

export interface WindowNav {
  /** 锚条目在**切片**里的下标；-1 = 不在切片内（没有可导航的邻居）。 */
  at: number
  /** 上一张在切片里的下标；null = 已是序列首张。 */
  prev: number | null
  /** 下一张在切片里的下标；null = 已是序列末张。 */
  next: number | null
}

export function windowNav(win: WindowSlice | null | undefined): WindowNav {
  if (win == null || win.index < 0 || win.count <= 0) return { at: -1, prev: null, next: null }
  const at = win.index - win.from
  if (at < 0 || at >= win.count) return { at: -1, prev: null, next: null }
  return {
    at,
    prev: at > 0 ? at - 1 : null,
    next: at < win.count - 1 ? at + 1 : null,
  }
}
