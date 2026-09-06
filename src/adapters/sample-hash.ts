/**
 * 三采样点内容签名（sha256 over 头/中/尾样本）。
 * 供所有文件系统适配器共用同一算法与采样区间：同字节序列 → 同签名（跨适配器一致）。
 * - 内存适配器：直接对整段字节按 sampleRanges 切片；
 * - 真实 node:fs 适配器：按同一 sampleRanges 从磁盘读段。
 */

import { createHash } from 'node:crypto'

export const SAMPLE_SIZE = 64 * 1024

/** 依文件总长给出 头/中/尾 采样区间（0 起、半开；彼此不重叠）。 */
export function sampleRanges(len: number): ReadonlyArray<readonly [number, number]> {
  if (len === 0) return []
  if (len <= SAMPLE_SIZE) return [[0, len]]
  const ranges: [number, number][] = [[0, SAMPLE_SIZE]] // 头
  if (len <= 2 * SAMPLE_SIZE) {
    ranges.push([len - SAMPLE_SIZE, len]) // 尾（覆盖中段）
  } else {
    const midStart = Math.max(SAMPLE_SIZE, Math.floor(len / 2) - Math.floor(SAMPLE_SIZE / 2))
    const midEnd = Math.min(len - SAMPLE_SIZE, midStart + SAMPLE_SIZE)
    if (midEnd > midStart) ranges.push([midStart, midEnd]) // 中
    ranges.push([len - SAMPLE_SIZE, len]) // 尾
  }
  return ranges
}

/** 整段字节的内容签名（头/中/尾三采样）。 */
export function sampleHash(bytes: Uint8Array): string {
  const hash = createHash('sha256')
  for (const [start, end] of sampleRanges(bytes.length)) {
    hash.update(bytes.subarray(start, end))
  }
  return hash.digest('hex')
}

/** 按给定采样区间喂数据（真实 FS 逐段读取时用同一算法）。 */
export function digestRanges(feed: (start: number, end: number) => Promise<Uint8Array>, len: number): Promise<string> {
  return (async () => {
    const hash = createHash('sha256')
    for (const [start, end] of sampleRanges(len)) {
      hash.update(await feed(start, end))
    }
    return hash.digest('hex')
  })()
}
