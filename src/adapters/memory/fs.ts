/**
 * 内存文件系统（FileSystem 端口实现）：扫描用例的确定性校准替身，不触真实磁盘。
 *
 * 规格：路径（正斜杠归一）→ 文件内容（UTF-8 字符串）或 'dir'（显式目录）。
 * 目录的父链自动补全为 dir；未显式声明的中间目录同样存在（可被 walk/stat 命中）。
 * 时间固定（T0）；遍历按路径名升序输出以保证确定性。
 */

import type { FileSystem, FsEntry, FsStat } from '../../ports/filesystem.ts'
import { sampleHash } from '../sample-hash.ts'

export type MemoryFsSpec = Readonly<Record<string, string | 'dir'>>

const T0 = '2026-09-05T00:00:00.000Z'

function normalize(p: string): string {
  const out = p.replaceAll('\\', '/')
  return out.length > 1 && out.endsWith('/') ? out.slice(0, -1) : out
}

export class MemoryFileSystem implements FileSystem {
  /** path → 文件字节 | null（目录）。父目录链已补全。 */
  private readonly entries: Map<string, Uint8Array | null>

  constructor(spec: MemoryFsSpec) {
    this.entries = new Map()
    for (const [raw, value] of Object.entries(spec)) {
      const path = normalize(raw)
      this.ensureParents(path)
      this.entries.set(path, value === 'dir' ? null : new TextEncoder().encode(value))
    }
  }

  async *walk(root: string): AsyncIterable<FsEntry> {
    const prefix = normalize(root)
    if (!this.entries.has(prefix) || this.entries.get(prefix) !== null) {
      throw new Error(`MemoryFileSystem: 目录不存在或不是目录（${root}）`)
    }
    const childPrefix = `${prefix}/`
    const paths = [...this.entries.keys()]
      .filter((p) => p.startsWith(childPrefix))
      .sort()
    for (const path of paths) {
      const value = this.entries.get(path)!
      yield { path, kind: value === null ? 'dir' : 'file' }
    }
  }

  async stat(path: string): Promise<FsStat> {
    const value = this.entries.get(normalize(path))
    if (value === undefined) return { exists: false }
    if (value === null) return { exists: true, kind: 'dir', modifiedAt: T0 }
    return {
      exists: true,
      kind: 'file',
      size: value.byteLength,
      modifiedAt: T0,
    }
  }

  async readHead(path: string, maxBytes: number): Promise<Uint8Array> {
    const value = this.entries.get(normalize(path))
    if (value === undefined || value === null) {
      throw new Error(`MemoryFileSystem: 文件不存在（${path}）`)
    }
    return value.subarray(0, maxBytes)
  }

  async hash(path: string): Promise<string> {
    const value = this.entries.get(normalize(path))
    if (value === undefined || value === null) {
      throw new Error(`MemoryFileSystem: 文件不存在（${path}）`)
    }
    return sampleHash(value)
  }

  async rename(from: string, to: string): Promise<void> {
    const src = normalize(from)
    const dst = normalize(to)
    const value = this.entries.get(src)
    if (value === undefined) throw new Error(`MemoryFileSystem: 路径不存在（${from}）`)
    if (this.entries.has(dst)) throw new Error(`MemoryFileSystem: 目标已存在（${to}）`)
    if (value === null && dst.startsWith(`${src}/`)) {
      throw new Error(`MemoryFileSystem: 目录不能移入自身子树（${from} → ${to}）`)
    }
    const dstParent = dst.slice(0, dst.lastIndexOf('/'))
    if (this.entries.get(dstParent) !== null) {
      throw new Error(`MemoryFileSystem: 目标父目录不存在（${to}）`)
    }
    // 目录：连同子树整体搬迁
    if (value === null) {
      const srcPrefix = `${src}/`
      for (const [p, v] of [...this.entries]) {
        if (p.startsWith(srcPrefix)) {
          this.entries.delete(p)
          this.entries.set(`${dst}/${p.slice(srcPrefix.length)}`, v)
        }
      }
    }
    this.entries.delete(src)
    this.entries.set(dst, value)
  }

  private ensureParents(path: string): void {
    const parts = path.split('/')
    let acc = ''
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc === '' ? parts[i] : `${acc}/${parts[i]}`
      if (!this.entries.has(acc)) this.entries.set(acc, null)
    }
  }
}

/** 便捷工厂：给定 路径 → 内容/'dir' 规格创建内存文件系统。 */
export function createMemoryFileSystem(spec: MemoryFsSpec): FileSystem {
  return new MemoryFileSystem(spec)
}
