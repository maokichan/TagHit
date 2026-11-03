/**
 * 诊断快照纯模块直验（D45）：node 直跑（node v24 可直跑 TS）。
 * 断言环形缓冲容量钳制、快照构造与静态事实兜底的形状——
 * 与 lrc.ts 的"node 直验"同款纪律，不进 CI 链（渲染层 Vitest 不便 import 宿主层）。
 * 断言用手写最小件（仓库零依赖纪律：不引 node:assert，无 @types/node）。
 * 用法：node scripts/diagnostics-selfcheck.ts
 */

import { buildSnapshot, DiagnosticsEventLog, staticFacts } from '../src/host/diagnostics.ts'

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`✗ ${label}\n  期望 ${e}\n  实际 ${a}`)
    process.exit(1)
  }
}

// 环形缓冲：超容量丢最旧
const log = new DiagnosticsEventLog(() => 't', 3)
log.push('a', '1')
log.push('b', '2')
log.push('c', '3')
log.push('d', '4')
assertEqual(log.list().map((e) => e.kind), ['b', 'c', 'd'], '环形缓冲丢最旧')
assertEqual(log.list()[0]?.at, 't', '时间戳来自注入时钟')

// buildSnapshot：事件按容量钳制，schemaVersion 单点注入
const snapshot = buildSnapshot({
  appVersion: '0.0.0',
  electronVersion: '33.4.11',
  platform: 'win32',
  isPackaged: true,
  paths: {
    appPath: '/app',
    hostDir: '/app/build',
    userData: '/u',
    dbPath: '/u/taghit.db',
    rendererTarget: '/app/build/renderer-dist/index.html',
    rendererTargetExists: false,
    pluginRoots: ['/u/plugins'],
  },
  load: { mode: 'packaged', target: '/x', ok: false, failCount: 1, lastError: 'did-fail-load' },
  events: log.list(),
})
assertEqual(snapshot.schemaVersion, 1, 'schemaVersion 单点')
assertEqual(snapshot.paths.rendererTargetExists, false, '目标存在性原样落位')
assertEqual(snapshot.events.length, 3, '事件原样带入')
assertEqual(snapshot.load.failCount, 1, '加载状态原样落位')

// buildSnapshot 超量事件被钳回容量内
const many = Array.from({ length: 80 }, (_, i) => ({ at: `t${i}`, kind: 'k', detail: String(i) }))
assertEqual(buildSnapshot({ ...snapshot, events: many }).events.length, 50, '超量事件钳到容量')
assertEqual(buildSnapshot({ ...snapshot, events: many }).events[0]?.detail, '30', '钳制丢最旧')

// staticFacts：无快照可读时的兜底形状（dev 打包两态的 mode 派生）
const facts = staticFacts({
  appVersion: '0.3.0',
  electronVersion: '33.4.11',
  platform: 'win32',
  isPackaged: false,
  userData: '/u',
  dbPath: '/u/taghit.db',
})
assertEqual(facts.load.mode, 'dev', '未打包 → dev')
assertEqual(facts.paths.rendererTargetExists, null, 'dev 态无可判文件')
assertEqual(facts.events, [], '静态事实无事件')

console.log('diagnostics-selfcheck: 全部断言通过')
