/**
 * 三采样点内容签名（sha256 over 头/中/尾样本）。
 * 供所有文件系统适配器共用同一算法：同字节序列 → 同签名（跨适配器一致）。
 * 采样：样本长 64 KiB；短文件（≤ 2 样本）退化为 头/尾；
 * 中部样本取在 头与尾之间居中，彼此不重叠。
 */

import { createHash } from 'node:crypto'

const SAMPLE_SIZE = 64 * 1024

export function sampleHash(bytes: Uint8Array): string {
  const hash = createHash('sha256')
  const len = bytes.length
  if (len === 0) {
    return hash.digest('hex')
  }
  hash.update(bytes.subarray(0, Math.min(len, SAMPLE_SIZE))) // 头
  if (len > SAMPLE_SIZE) {
    if (len <= 2 * SAMPLE_SIZE) {
      hash.update(bytes.subarray(len - SAMPLE_SIZE, len)) // 尾（覆盖中段）
    } else {
      const midStart = Math.max(SAMPLE_SIZE, Math.floor(len / 2) - Math.floor(SAMPLE_SIZE / 2))
      const midEnd = Math.min(len - SAMPLE_SIZE, midStart + SAMPLE_SIZE)
      if (midEnd > midStart) hash.update(bytes.subarray(midStart, midEnd)) // 中
      hash.update(bytes.subarray(len - SAMPLE_SIZE, len)) // 尾
    }
  }
  return hash.digest('hex')
}
