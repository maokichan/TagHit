declare module 'node:crypto' {
  export interface Hash {
    update(data: Uint8Array | string): Hash
    digest(encoding?: string): string
  }

  export function createHash(algorithm: string): Hash
  export function randomUUID(): string
}

declare module 'node:fs/promises' {
  export interface DirentLike {
    name: string
    isDirectory(): boolean
  }

  export interface FileHandle {
    read(
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number
    ): Promise<{ bytesRead: number }>
    close(): Promise<void>
  }

  export function readdir(path: string, options: { withFileTypes: true }): Promise<DirentLike[]>
  export function stat(
    path: string
  ): Promise<{
    size: number
    mtimeMs: number
    isFile(): boolean
    isDirectory(): boolean
  }>
  export function open(path: string, flags: string): Promise<FileHandle>
  export function rename(from: string, to: string): Promise<void>
  /** 插件安装位（D48）：目录创建与递归删除。 */
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
  export function readFile(path: string, encoding: 'utf8'): Promise<string>
  /** 安装位自检夹具（scripts/plugins-selfcheck.ts）。 */
  export function mkdtemp(prefix: string): Promise<string>
  export function writeFile(path: string, data: Uint8Array | string): Promise<void>
}

declare module 'node:os' {
  export function tmpdir(): string
}
