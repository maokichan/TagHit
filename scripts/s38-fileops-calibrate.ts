/**
 * 文件操作校准（memory 与 sqlite 双跑同一场景）：node scripts/s38-fileops-calibrate.ts。
 */

import { createMemoryStore } from '../src/adapters/memory/index.ts'
import { createSqliteStore } from '../src/adapters/sqlite/index.ts'
import { runFileOpsScenario } from './s38-fileops-scenario.ts'

console.log('—— 文件操作校准：memory ——')
await runFileOpsScenario(createMemoryStore())

console.log('\n—— 文件操作校准：sqlite(:memory:) ——')
await runFileOpsScenario(createSqliteStore(':memory:'))
