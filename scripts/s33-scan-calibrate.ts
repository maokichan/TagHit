/**
 * 两阶段扫描校准（memory 与 sqlite 双跑同一场景）：node scripts/s33-scan-calibrate.ts。
 */

import { createMemoryStore } from '../src/adapters/memory/index.ts'
import { createSqliteStore } from '../src/adapters/sqlite/index.ts'
import { runScanScenario } from './s33-scan-scenario.ts'

console.log('—— 扫描校准：memory ——')
await runScanScenario(createMemoryStore())

console.log('\n—— 扫描校准：sqlite(:memory:) ——')
await runScanScenario(createSqliteStore(':memory:'))
