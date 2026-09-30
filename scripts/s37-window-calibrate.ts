/**
 * 顺序窗口校准（memory 与 sqlite 双跑同一场景）：node scripts/s37-window-calibrate.ts。
 */

import { createMemoryStore } from '../src/adapters/memory/index.ts'
import { createSqliteStore } from '../src/adapters/sqlite/index.ts'
import { runWindowScenario } from './s37-window-scenario.ts'

console.log('—— 顺序窗口校准：memory ——')
await runWindowScenario(createMemoryStore())

console.log('\n—— 顺序窗口校准：sqlite(:memory:) ——')
await runWindowScenario(createSqliteStore(':memory:'))
