/**
 * LRC 歌词解析（纯函数，D43）：呈现层逻辑归插件——宿主只交付歌词原文。
 * 支持行首连续多个时间戳标签；无时间轴的正文行保留（静态展示，不参与同步）；
 * [ti:]/[ar:]/[offset:] 等元数据标签行丢弃。
 */

export interface LrcLine {
  /** 秒；无时间轴行 = -1（排在有轴行之后，永不成为活动行） */
  time: number
  text: string
}

const TIME_TAG = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/
const META_TAG = /^\[[a-zA-Z#]/

/** 解析歌词原文 → 时间轴行（按时间升序）。无任何时间戳 → 全部 time=-1。 */
export function parseLrc(raw: string): LrcLine[] {
  const out: LrcLine[] = []
  for (const rawLine of raw.split(/\r\n|\n|\r/)) {
    let rest = rawLine
    const stamps: number[] = []
    for (;;) {
      const m = TIME_TAG.exec(rest)
      if (m == null) break
      const frac = m[3] != null ? Number(m[3]) / 10 ** m[3].length : 0
      stamps.push(Number(m[1]) * 60 + Number(m[2]) + frac)
      rest = rest.slice(m[0].length)
    }
    const text = rest.trim()
    if (text === '') continue
    if (stamps.length === 0) {
      if (META_TAG.test(rest)) continue // [ti:...] 等元数据标签行
      out.push({ time: -1, text })
    } else {
      for (const time of stamps) out.push({ time, text })
    }
  }
  return out.sort((a, b) => (a.time === -1 ? 1 : b.time === -1 ? -1 : a.time - b.time))
}

/** 当前播放时刻的活动行下标（二分，最后一个 time ≤ t 的行）；无轴或不早于首行 → -1。 */
export function activeLrcIndex(lines: LrcLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time >= 0 && lines[mid].time <= t) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}
