/**
 * 两阶段扫描校准场景（适配器无关）：挂根 → 整树扫描 → 磁盘变化重扫
 * → 文件消失(keep/discard) → 节点清理/浏览可见性派生，逐项断言。
 * 由 scripts/s33-scan-calibrate.ts 在 memory 与 sqlite 上各跑一遍。
 */

import type { FileItem, Id, Item } from '../src/domain/index.ts'
import type { Store } from '../src/ports/index.ts'
import type { FileSystem } from '../src/ports/index.ts'
import { createMemoryFileSystem } from '../src/adapters/memory/index.ts'
import { sampleHash } from '../src/adapters/sample-hash.ts'
import {
  browseWorkspace,
  mountWorkspaceRoot,
  scanWorkspace,
  tagItem,
} from '../src/application/index.ts'
import type { AppServices, ScanSummary } from '../src/application/index.ts'

const T0 = '2026-09-05T00:00:00.000Z'

let executedAsserts = 0

function assert(cond: boolean, msg: string): void {
  executedAsserts++
  if (!cond) {
    console.error(`✗ ${msg}`)
    throw new Error(msg)
  }
  console.log(`ok  ${msg}`)
}

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

function makeIdGen(): { newId(): Id } {
  let n = 0
  return { newId: () => `id-${++n}` }
}

function sha(text: string): string {
  return sampleHash(new TextEncoder().encode(text))
}

async function findItemByUri(store: Store, uri: string): Promise<Item> {
  const hits = await store.queryItems({ sourceUriPrefix: uri })
  const hit = hits.find((h) => h.item.kind === 'file' && h.item.sourceUri === uri)
  if (!hit) throw new Error(`条目不存在：${uri}`)
  return hit.item
}

/** 断言并收窄为 file 条目。 */
function asFile(it: Item): FileItem {
  if (it.kind !== 'file') throw new Error(`期望 file 条目：${it.id}`)
  return it
}

export async function runScanScenario(store: Store): Promise<void> {
  const svc: AppServices = { store, clock: { now: () => T0 }, idGen: makeIdGen() }
  await store.createWorkspace({ id: 'ws-scan', name: '扫描库', createdAt: T0 })
  await mountWorkspaceRoot(svc, 'ws-scan', 'R:/库')

  const fsA: FileSystem = createMemoryFileSystem({
    'R:/库/photo1.jpg': 'JPGDATA-111-AAAAAAAAAAAAAAAA',
    'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB',
    'R:/库/sub/video.mp4': 'MP4-AAAABBBBCCCCDDDDEEEEFFFF',
  })

  const s1: ScanSummary = await scanWorkspace(svc, fsA, 'ws-scan')
  assertEqual(
    s1,
    {
      scannedRoots: 1,
      nodesCreated: 2, // 根 + sub
      nodesRemoved: 0,
      itemsCreated: 3,
      itemsUpdated: 0,
      itemsMissing: 0,
      itemsDiscarded: 0,
    },
    '扫描①：初始整树入库'
  )
  const browse1 = await browseWorkspace(svc, 'ws-scan')
  assertEqual(
    browse1.map((h) => asFile(h.item).sourceUri).sort(),
    ['R:/库/photo1.jpg', 'R:/库/photo2.jpg', 'R:/库/sub/video.mp4'],
    '扫描①：浏览可见 3 个条目（节点 included）'
  )
  const photo1 = asFile(await findItemByUri(store, 'R:/库/photo1.jpg'))
  assertEqual(photo1.contentHash, sha('JPGDATA-111-AAAAAAAAAAAAAAAA'), '扫描①：photo1 内容签名正确')
  assertEqual(photo1.title, 'photo1.jpg', '扫描①：title = 文件名')

  await store.createTag({ id: 'tag-x', name: '留念', createdAt: T0 })
  await tagItem(svc, photo1.id, ['tag-x'])

  // 磁盘变化：photo2 内容变更、sub 目录整体消失、新增 photo3
  const fsB: FileSystem = createMemoryFileSystem({
    'R:/库/photo1.jpg': 'JPGDATA-111-AAAAAAAAAAAAAAAA',
    'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED',
    'R:/库/photo3.jpg': 'JPGDATA-333-CCCCCCCCCCCCCCCC',
  })
  const s2: ScanSummary = await scanWorkspace(svc, fsB, 'ws-scan')
  assertEqual(
    s2,
    {
      scannedRoots: 1,
      nodesCreated: 0,
      nodesRemoved: 1, // sub 目录消失
      itemsCreated: 1, // photo3
      itemsUpdated: 1, // photo2 内容变更
      itemsMissing: 1, // sub/video.mp4 消失 → missing（keep）
      itemsDiscarded: 0,
    },
    '扫描②：增量 diff（变更/新增/消失目录/消失文件）'
  )
  assertEqual(
    asFile(await findItemByUri(store, 'R:/库/photo2.jpg')).contentHash,
    sha('JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED'),
    '扫描②：photo2 签名已更新'
  )
  const video = asFile(await findItemByUri(store, 'R:/库/sub/video.mp4'))
  assertEqual(video.status, 'missing', '扫描②：目录消失后文件条目 → missing 保留')
  const nodes = await store.listPathNodes({ workspaceId: 'ws-scan' })
  assert(
    !nodes.some((n) => n.dirPath === 'R:/库/sub'),
    '扫描②：消失目录的节点行已删除'
  )

  // 文件消失（目录在）：keep 策略 → 标 missing
  const fsC: FileSystem = createMemoryFileSystem({
    'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED',
    'R:/库/photo3.jpg': 'JPGDATA-333-CCCCCCCCCCCCCCCC',
  })
  const s3: ScanSummary = await scanWorkspace(svc, fsC, 'ws-scan')
  assertEqual(
    {
      scannedRoots: s3.scannedRoots,
      nodesCreated: s3.nodesCreated,
      nodesRemoved: s3.nodesRemoved,
      itemsCreated: s3.itemsCreated,
      itemsUpdated: s3.itemsUpdated,
      itemsMissing: s3.itemsMissing,
      itemsDiscarded: s3.itemsDiscarded,
    },
    {
      scannedRoots: 1,
      nodesCreated: 0,
      nodesRemoved: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsMissing: 1,
      itemsDiscarded: 0,
    },
    '扫描③：photo1 消失 → keep 标 missing'
  )
  assertEqual(asFile(await findItemByUri(store, 'R:/库/photo1.jpg')).status, 'missing', '扫描③：photo1 状态 missing')

  // 另一工作区同根、discard 策略：消失的 photo1 直接删除（含挂载）
  await store.createWorkspace({ id: 'ws-discard', name: '丢弃库', createdAt: T0 })
  await mountWorkspaceRoot(svc, 'ws-discard', 'R:/库')
  const s4: ScanSummary = await scanWorkspace(svc, fsC, 'ws-discard', { missing: 'discard' })
  assertEqual(
    s4,
    {
      scannedRoots: 1,
      nodesCreated: 1, // 根节点
      nodesRemoved: 0,
      itemsCreated: 0, // photo2/3 已全局存在
      itemsUpdated: 0,
      itemsMissing: 0,
      itemsDiscarded: 2, // photo1 + ws1 已标 missing 的 video（同根、磁盘已无）
    },
    '扫描④：discard 策略删除消失条目（含先前 missing 的 video）'
  )
  assert((await store.getItem(photo1.id)) === null, '扫描④：photo1 条目已删除')
  assert((await store.getItem(video.id)) === null, '扫描④：video 条目一并删除')
  assertEqual(
    (await store.listAttachments({ tagId: 'tag-x' })).length,
    0,
    '扫描④：其挂载（留念）已清理'
  )

  const browseFinal = await browseWorkspace(svc, 'ws-scan')
  assertEqual(
    browseFinal.map((h) => asFile(h.item).sourceUri).sort(),
    ['R:/库/photo2.jpg', 'R:/库/photo3.jpg'],
    '收尾：ws-scan 浏览仅含现存目录内条目（missing/节点消失者不出现在视图）'
  )

  console.log(`\nSCAN CHECKS PASSED（断言执行 ${executedAsserts} 个）`)
}
