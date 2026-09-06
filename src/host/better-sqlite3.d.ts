/**
 * better-sqlite3 最小类型声明：只需满足适配层 SyncSqlite 接口的用法
 * （exec / close / prepare().run|get|all），完整类型不在宿主层引入。
 */
declare module 'better-sqlite3' {
  export interface Statement {
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
  export default class Database {
    constructor(path: string)
    exec(sql: string): this
    close(): void
    prepare(sql: string): Statement
  }
}
