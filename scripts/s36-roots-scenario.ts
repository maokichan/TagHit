/**
 * S3.6 来源根生命周期校准场景（适配器无关）：退役根记录 + 脱根条目管理。
 *
 * 防的是"卸载来源根后条目永久不可见且无从管理"：卸载只删来源根行与节点树，
 * 条目按裁决保留 → 它们脱离全部来源根、不进任何工作区视图。本场景把
 * 「卸载留记录 → 记录可寻址 → 清理只动脱根条目 → 重新挂载+扫描即恢复」
 * 钉成断言，并覆盖无记录的历史残留（按父目录聚合）与大库全量读（SQL 参数分块）。
 *
 * 运行方：scripts/s36-roots-calibrate.ts（memory 与 sqlite 双跑）。
 */

import type { FileItem, Id } from '../src/domain/index.ts'
import type { Store } from '../src/ports/index.ts'
import { createMemoryFileSystem } from '../src/adapters/memory/index.ts'
import {
  browseWorkspace,
  cleanupDetachedItems,
  mountWorkspaceRoot,
  rootManagement,
  scanWorkspace,
  unmountWorkspaceRoot,
} from '../src/application/index.ts'
import type { AppServices } from '../src/application/index.ts'

const T0 = '2026-09-12T00:00:00.000Z'
const T1 = '2026-09-12T01:00:00.000Z'
const WS = 'ws-roots'

let executedAsserts = 0

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  executedAsserts++
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`✗ ${msg}\n  实际: ${a}\n  期望: ${e}`)
    throw new Error(msg)
  }
  console.log(`ok  ${msg}`)
}

function fileItem(id: Id, sourceUri: string, createdAt = T0): FileItem {
  return {
    kind: 'file',
    id,
    title: sourceUri.slice(sourceUri.lastIndexOf('/') + 1),
    sourceUri,
    contentHash: null,
    size: 512,
    fileModifiedAt: T0,
    status: 'active',
    createdAt,
  }
}

export async function runRootsScenario(store: Store): Promise<void> {
  let tick = 0
  /** 时钟可控：卸载时间戳需要可断言（T0 挂载、T1 卸载）。 */
  let now = T0
  const svc: AppServices = {
    store,
    clock: { now: () => now },
    idGen: { newId: () => `gen-${++tick}` },
  }

  await store.createWorkspace({ id: WS, name: '根生命周期', createdAt: T0 })

  // ---- ① 挂载 + 扫描：根下条目可见 ----------------------------------------
  const fs = createMemoryFileSystem({
    'R:/A/a1.jpg': 'AAA-111',
    'R:/A/sub/a2.jpg': 'AAA-222',
    'R:/B/b1.jpg': 'BBB-111',
  })
  await mountWorkspaceRoot(svc, WS, 'R:/A')
  await mountWorkspaceRoot(svc, WS, 'R:/B')
  await scanWorkspace(svc, fs, WS)
  assertEqual((await browseWorkspace(svc, WS)).total, 3, '① 两个根下 3 个条目全部可见')

  // ---- ② 卸载 A：条目退出视图，且落一条退役记录 ---------------------------
  now = T1
  await unmountWorkspaceRoot(svc, WS, 'R:/A')
  assertEqual((await browseWorkspace(svc, WS)).total, 1, '② 卸载后 A 下条目退出视图（B 不受影响）')

  const mgmt = await rootManagement(svc, WS)
  assertEqual(
    mgmt.retired.map((r) => ({ path: r.path, retiredAt: r.retiredAt, itemCount: r.itemCount })),
    [{ path: 'R:/A', retiredAt: T1, itemCount: 2 }],
    '② 退役根记录：路径 + 卸载时间 + 条目数（实时前缀统计）'
  )
  assertEqual(mgmt.untrackedTotal, 0, '② 有记录的脱根条目不重复计入"无记录"段')

  // ---- ③ 卸载不存在的根 = no-op，不留假记录 -------------------------------
  await unmountWorkspaceRoot(svc, WS, 'R:/不存在')
  assertEqual(
    (await rootManagement(svc, WS)).retired.length,
    1,
    '③ 卸载不存在的根不留假记录（保持 no-op 语义）'
  )

  // ---- ④ 无记录的历史残留：按父目录聚合 -----------------------------------
  await store.createItem(fileItem('legacy-1', 'R:/遗留/x1.txt'))
  await store.createItem(fileItem('legacy-2', 'R:/遗留/sub/x2.txt'))
  const withLegacy = await rootManagement(svc, WS)
  assertEqual(withLegacy.untrackedTotal, 2, '④ 无记录脱根条目计入 untracked')
  assertEqual(
    withLegacy.untrackedGroups,
    [
      { dirPath: 'R:/遗留', count: 1 },
      { dirPath: 'R:/遗留/sub', count: 1 },
    ],
    '④ 无记录残留按父目录聚合'
  )

  // ---- ⑤ 重新挂载同一路径：记录清除；重扫后条目恢复 ------------------------
  await mountWorkspaceRoot(svc, WS, 'R:/A')
  assertEqual((await rootManagement(svc, WS)).retired.length, 0, '⑤ 重新挂载清除退役记录')
  assertEqual((await browseWorkspace(svc, WS)).total, 1, '⑤ 仅挂载未扫描：节点未重建，条目仍不可见')
  await scanWorkspace(svc, fs, WS)
  assertEqual((await browseWorkspace(svc, WS)).total, 3, '⑤ 重新扫描后 A 下条目恢复可见（条目本就还在）')

  // ---- ⑥ 清理安全性：候选集恒为脱根条目，绝不删仍在根下的条目 -------------
  const safe = await cleanupDetachedItems(svc, WS, 'R:/B')
  assertEqual(safe.deleted, 0, '⑥ 对来源根路径清理 = 0 条（在根下的条目受保护）')
  assertEqual((await browseWorkspace(svc, WS)).total, 3, '⑥ 受保护条目仍在视图内')

  // ---- ⑦ 按目录子树清理无记录残留（路径段语义：含其子目录） ---------------
  const cleaned = await cleanupDetachedItems(svc, WS, 'R:/遗留')
  assertEqual(cleaned.deleted, 2, '⑦ 清理 R:/遗留 子树：含其子目录的 2 条')
  assertEqual((await rootManagement(svc, WS)).untrackedTotal, 0, '⑦ 清理后无记录残留归零')

  // ---- ⑧ 清理退役根条目：条目与其记录一并收尾 -----------------------------
  await unmountWorkspaceRoot(svc, WS, 'R:/A')
  assertEqual((await rootManagement(svc, WS)).retired[0]?.itemCount, 2, '⑧ 退役根条目数 = 2')
  const purged = await cleanupDetachedItems(svc, WS, 'R:/A')
  assertEqual(purged.deleted, 2, '⑧ 清理退役根：删其 2 条条目')
  assertEqual((await rootManagement(svc, WS)).retired.length, 0, '⑧ 记录随之收尾')
  assertEqual((await browseWorkspace(svc, WS)).total, 1, '⑧ 仅 B 下条目存活')

  // ---- ⑨ 全量读（无 limit）在大结果集上可用：SQL 绑定参数分块 ------------
  const BULK = 600
  await store.createTag({ id: 'tag-bulk', name: '批量', createdAt: T0 })
  for (let i = 0; i < BULK; i++) {
    const id = `bulk-${String(i).padStart(3, '0')}`
    await store.createItem(fileItem(id, `R:/大/f${String(i).padStart(3, '0')}.jpg`, T0 + String(i)))
  }
  await store.attachTag('bulk-000', 'tag-bulk')
  await store.attachTag('bulk-499', 'tag-bulk') // 分块边界（500/块）两侧
  await store.attachTag('bulk-500', 'tag-bulk')
  await store.attachTag(`bulk-${BULK - 1}`, 'tag-bulk')

  const bulk = await store.queryItems({ underDirPath: 'R:/大' })
  assertEqual(bulk.length, BULK, '⑨ 无 limit 全量读：600 条一条不漏（分块不丢批）')
  assertEqual(
    bulk.filter((h) => h.tags.length > 0).map((h) => h.item.id).sort(),
    ['bulk-000', 'bulk-499', 'bulk-500', 'bulk-599'],
    '⑨ 分块边界两侧的标签都随行返回（含末块）'
  )
  assertEqual(
    await store.countItems({ underDirPath: 'R:/大' }),
    BULK,
    '⑨ countItems 与 queryItems 同条件同解'
  )

  console.log(`\nROOTS CHECKS PASSED（断言执行 ${executedAsserts} 个）`)
}
