/**
 * 边界输入校准入口（memory 与 sqlite 双跑同一场景）：node scripts/s34-boundary.ts。
 * 对外暴露面（契约端点的用例层）的输入合法性专项——非法输入必须以 DomainError
 * 收场（经信封转译），不得炸进程、不得落脏数据。动契约后与三份校准一并跑。
 */

import { createMemoryStore } from '../src/adapters/memory/index.ts'
import { createSqliteStore } from '../src/adapters/sqlite/index.ts'
import { runBoundaryScenario } from './s34-boundary-scenario.ts'

console.log('—— 边界校准：memory ——')
await runBoundaryScenario(createMemoryStore())

console.log('\n—— 边界校准：sqlite(:memory:) ——')
await runBoundaryScenario(createSqliteStore(':memory:'))
