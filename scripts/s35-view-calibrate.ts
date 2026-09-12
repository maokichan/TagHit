/**
 * 浏览窗口校准（memory 与 sqlite 双跑同一场景）：node scripts/s35-view-calibrate.ts。
 *
 * 双跑的意义不止"契约一致"：可见性派生的 SQL 译文（父目录表达式）无法用领域纯函数表达，
 * 靠同一场景在两种适配器上给出相同结果，才能证明 SQL 与 parentDir 同解。
 */

import { createMemoryStore } from '../src/adapters/memory/index.ts'
import { createSqliteStore } from '../src/adapters/sqlite/index.ts'
import { runViewScenario } from './s35-view-scenario.ts'

console.log('—— 浏览窗口校准：memory ——')
await runViewScenario(createMemoryStore())

console.log('\n—— 浏览窗口校准：sqlite(:memory:) ——')
await runViewScenario(createSqliteStore(':memory:'))
