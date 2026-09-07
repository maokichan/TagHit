/**
 * 宿主 node 内置模块最小声明（protocol.ts 用；零依赖类型检查用）。
 * node:crypto 与 node:fs/promises 的声明在 adapters/node-builtins.d.ts。
 */

declare module 'node:url' {
  export function pathToFileURL(path: string): { href: string; toString(): string }
}

declare module 'node:path' {
  export const sep: string
  export function normalize(path: string): string
  export function join(...parts: string[]): string
}

declare module 'node:fs' {
  export interface ReadStream {
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array>
  }
  export function createReadStream(path: string, options?: { start?: number; end?: number }): ReadStream
  export function statSync(path: string): { size: number }
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function writeFileSync(path: string, data: Uint8Array): void
}

declare module 'node:stream' {
  export const Readable: {
    toWeb(stream: unknown): ReadableStream<Uint8Array>
  }
}

/** 主进程真实运行在完整 Node（better-sqlite3 场景），此处仅补类型检查用最小面。 */
declare const Buffer: {
  from(data: string, encoding: string): Uint8Array
}
