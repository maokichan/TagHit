/**
 * 来源根生命周期校准（memory 与 sqlite 双跑同一场景）：node scripts/s36-roots-calibrate.ts。
 */

import { createMemoryStore } from '../src/adapters/memory/index.ts'
import { createSqliteStore } from '../src/adapters/sqlite/index.ts'
import { runRootsScenario } from './s36-roots-scenario.ts'

console.log('—— 来源根生命周期校准：memory ——')
await runRootsScenario(createMemoryStore())

console.log('\n—— 来源根生命周期校准：sqlite(:memory:) ——')
await runRootsScenario(createSqliteStore(':memory:'))
