/**
 * S3.2 校准（内存适配器）：node scripts/s32-calibrate.ts（node ≥ v24 直跑 TS）。
 */

import { createMemoryStore } from '../src/adapters/memory/index.ts'
import { runScenario } from './s32-scenario.ts'

console.log('—— 校准：memory ——')
await runScenario(createMemoryStore())
