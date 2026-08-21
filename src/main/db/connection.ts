import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { runMigrations } from './migrations'

/**
 * AppDb —— WAL 模式下的双连接封装。
 * - write：写连接（扫描等长时间事务持有写锁时，读不阻塞）
 * - read：读连接
 * 采用 better-sqlite3（同步 API），业务层在异步分块中调用，避免阻塞主进程事件循环。
 */
export class AppDb {
  constructor(
    readonly write: Database.Database,
    readonly read: Database.Database
  ) {}

  close(): void {
    this.read.close()
    this.write.close()
  }
}

export function openDb(file: string): AppDb {
  mkdirSync(dirname(file), { recursive: true })

  const write = new Database(file)
  write.pragma('journal_mode = WAL')
  write.pragma('foreign_keys = ON')
  write.pragma('busy_timeout = 5000')
  write.pragma('synchronous = NORMAL')

  const read = new Database(file, { readonly: false })
  read.pragma('journal_mode = WAL')
  read.pragma('busy_timeout = 5000')

  runMigrations(write)

  return new AppDb(write, read)
}
