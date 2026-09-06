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
    constructor(path?: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
