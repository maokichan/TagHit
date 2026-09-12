declare module 'node:crypto' {
  export interface Hash {
    update(data: Uint8Array): Hash
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
}
