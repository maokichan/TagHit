declare module 'node:sqlite' {
  export interface RunResult {
    changes: number | bigint
    lastInsertRowid: number | bigint
  }

  export interface StatementSync {
    run(...params: unknown[]): RunResult
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }

  export class DatabaseSync {
    /** `readOnly` 只读打开（自检工具用：对着运行中的库跑，绝不写）。 */
    constructor(path?: string, options?: { readOnly?: boolean })
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
