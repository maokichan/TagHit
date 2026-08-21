import { open } from 'fs/promises'
import { xxhash64 } from 'hash-wasm'

const FIRST_64KB = 64 * 1024

/**
 * 计算文件前 64KB 的 xxHash64（大文件扫描性能优化，语义沿用 Tauri 版）。
 * hash-wasm 为纯 WASM 实现，无原生依赖，跨平台。
 */
export async function hashFileFirst64Kb(filePath: string): Promise<string> {
  const handle = await open(filePath, 'r')
  try {
    const buf = Buffer.alloc(FIRST_64KB)
    const { bytesRead } = await handle.read(buf, 0, FIRST_64KB, 0)
    return await xxhash64(buf.subarray(0, bytesRead), 0)
  } finally {
    await handle.close()
  }
}

export { xxhash64 }
