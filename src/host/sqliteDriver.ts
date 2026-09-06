/**
 * 宿主 SQLite 驱动：打开 better-sqlite3 连接并按适配层 SyncSqlite 接口交出。
 * Electron 主进程（Node 20）没有 node:sqlite，这是真机运行的驱动来源；
 * better-sqlite3 原生包按 Electron ABI 预编译，需保持与 electron 版本匹配（D13）。
 */

import Database from 'better-sqlite3'
import type { SyncSqlite } from '../adapters/sqlite/index.ts'

export function openSqlite(path: string): SyncSqlite {
  return new Database(path)
}
