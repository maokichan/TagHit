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
  export function dirname(path: string): string
  export function join(...parts: string[]): string
  export function resolve(...parts: string[]): string
  /** 插件安装位落点校验（plugins.ts isUnderDir）。 */
  export function relative(from: string, to: string): string
}

declare module 'node:fs' {
  export interface ReadStream {
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array>
  }
  export interface StatLike {
    size: number
    mtime: Date
    isFile(): boolean
    isDirectory(): boolean
  }
  export function createReadStream(path: string, options?: { start?: number; end?: number }): ReadStream
  export function statSync(path: string): StatLike
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function writeFileSync(path: string, data: string | Uint8Array): void
  /** 同步写文件描述符（1 = stdout）：--diagnose 提前退出时防管道输出截断（D45）。 */
  export function writeSync(fd: number, data: string): number
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

/** yauzl（extract-zip 的解包引擎，插件安装位预检用；@types 被 .npmrc omit，最小面自维护）。 */
declare module 'yauzl' {
  export interface Entry {
    fileName: string
    uncompressedSize: number
  }
  export interface ZipFile {
    on(event: 'entry', listener: (entry: Entry) => void): void
    on(event: 'end', listener: () => void): void
    on(event: 'error', listener: (error: Error) => void): void
    readEntry(): void
    close(): void
  }
  export function open(
    path: string,
    options: { lazyEntries: true },
    callback: (error: Error | null, zipfile?: ZipFile) => void
  ): void
}

/** bundle:host 以 cjs 格式输出（build/main.cjs），CJS 的模块目录全局在运行时存在。 */
declare const __dirname: string
