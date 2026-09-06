/**
 * S3.2 校准（SQLite 适配器，:memory:）：node scripts/s32-calibrate-sqlite.ts。
 * 与 memory 跑同一份场景（scripts/s32-scenario.ts），验证两适配器契约一致性。
 */

import { createSqliteStore } from '../src/adapters/sqlite/index.ts'
import { runScenario } from './s32-scenario.ts'

console.log('—— 校准：sqlite(:memory:) ——')
await runScenario(createSqliteStore(':memory:'))
