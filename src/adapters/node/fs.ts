/**
 * 真实文件系统（FileSystem 端口实现）：node:fs/promises，宿主（Electron 主进程）使用。
 * 内容签名与 MemoryFileSystem 完全一致（同一 sampleRanges/采样算法，按磁盘段读取）。
 */

import { open, readdir, rename, stat } from 'node:fs/promises'
import type { FileSystem, FsEntry, FsStat } from '../../ports/filesystem.ts'
import { SAMPLE_SIZE, digestRanges } from '../sample-hash.ts'

function join(dir: string, name: string): string {
  return dir.endsWith('/') ? dir + name : `${dir}/${name}`
}

function toIso(ms: number): string {
  return new Date(ms).toISOString()
}

export class NodeFileSystem implements FileSystem {
  async *walk(root: string): AsyncIterable<FsEntry> {
    const st = await stat(root)
    if (!st.isDirectory()) throw new Error(`NodeFileSystem: 目录不存在或不是目录（${root}）`)
    yield* this.walkDir(root)
  }

  private async *walkDir(dir: string): AsyncGenerator<FsEntry> {
    const entries = await readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        yield { path, kind: 'dir' }
        yield* this.walkDir(path)
      } else {
        yield { path, kind: 'file' }
      }
    }
  }

  async stat(path: string): Promise<FsStat> {
    try {
      const st = await stat(path)
      if (st.isFile()) {
        return { exists: true, kind: 'file', size: st.size, modifiedAt: toIso(st.mtimeMs) }
      }
      return { exists: true, kind: 'dir', modifiedAt: toIso(st.mtimeMs) }
    } catch {
      return { exists: false }
    }
  }

  async readHead(path: string, maxBytes: number): Promise<Uint8Array> {
    const handle = await open(path, 'r')
    try {
      const buffer = new Uint8Array(maxBytes)
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
      return buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  }

  async hash(path: string): Promise<string> {
    const size = (await stat(path)).size
    const handle = await open(path, 'r')
    try {
      return await digestRanges(async (start, end) => {
        const buffer = new Uint8Array(Math.min(end - start, SAMPLE_SIZE))
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
        return buffer.subarray(0, bytesRead)
      }, size)
    } finally {
      await handle.close()
    }
  }

  async rename(from: string, to: string): Promise<void> {
    // node rename：to 已存在（Windows/POSIX 语义一致地失败）或 from 不存在 → reject
    await rename(from, to)
  }
}

export function createNodeFileSystem(): FileSystem {
  return new NodeFileSystem()
}
