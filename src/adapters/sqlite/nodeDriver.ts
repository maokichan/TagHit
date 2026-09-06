/**
 * node:sqlite 驱动来源（Node ≥22，开发/校准环境）。
 * 独立成文件：Electron 主进程（Node 20）没有 node:sqlite，
 * 宿主打包时只引 store.ts，不把本文件拉进产物。
 */

import { DatabaseSync } from 'node:sqlite'
import { SqliteStore } from './store.ts'
import type { Store } from '../../ports/store.ts'

/** 新建 node:sqlite Store；path 缺省为 ':memory:'（校准/测试）。 */
export function createSqliteStore(path = ':memory:'): Store {
  return new SqliteStore(new DatabaseSync(path))
}
