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
  const hits = await store.queryItems({ underDirPath: uri })
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
      itemsRelocated: 0,
      itemsUpdated: 0,
      itemsMissing: 0,
      itemsDiscarded: 0,
      dirsUnreadable: 0,
      filesUnreadable: 0,
    },
    '扫描①：初始整树入库'
  )
  const browse1 = (await browseWorkspace(svc, 'ws-scan')).items
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
      itemsRelocated: 0, // 新增 photo3 与 missing 的 video 不同内容 → 不认领
      itemsUpdated: 1, // photo2 内容变更
      itemsMissing: 1, // sub/video.mp4 消失 → missing（keep）
      itemsDiscarded: 0,
      dirsUnreadable: 0,
      filesUnreadable: 0,
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
      itemsRelocated: s3.itemsRelocated,
      itemsUpdated: s3.itemsUpdated,
      itemsMissing: s3.itemsMissing,
      itemsDiscarded: s3.itemsDiscarded,
      dirsUnreadable: s3.dirsUnreadable,
      filesUnreadable: s3.filesUnreadable,
    },
    {
      scannedRoots: 1,
      nodesCreated: 0,
      nodesRemoved: 0,
      itemsCreated: 0,
      itemsRelocated: 0,
      itemsUpdated: 0,
      itemsMissing: 1,
      itemsDiscarded: 0,
      dirsUnreadable: 0,
      filesUnreadable: 0,
    },
    '扫描③：photo1 消失 → keep 标 missing'
  )
  assertEqual(asFile(await findItemByUri(store, 'R:/库/photo1.jpg')).status, 'missing', '扫描③：photo1 状态 missing')

  // 扫描③b：移动认领——photo1 原内容出现在新路径 moved/ 下 → 认领（id 不变，标签随行）
  const fsD: FileSystem = createMemoryFileSystem({
    'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED',
    'R:/库/photo3.jpg': 'JPGDATA-333-CCCCCCCCCCCCCCCC',
    'R:/库/moved/photo1.jpg': 'JPGDATA-111-AAAAAAAAAAAAAAAA',
  })
  const s3b: ScanSummary = await scanWorkspace(svc, fsD, 'ws-scan')
  assertEqual(
    s3b,
    {
      scannedRoots: 1,
      nodesCreated: 1, // moved 目录
      nodesRemoved: 0,
      itemsCreated: 0,
      itemsRelocated: 1, // photo1 被认领：改写路径并恢复 active
      itemsUpdated: 0,
      itemsMissing: 0,
      itemsDiscarded: 0,
      dirsUnreadable: 0,
      filesUnreadable: 0,
    },
    '扫描③b：同内容新路径认领 missing 条目（移动语义）'
  )
  const moved1 = asFile(await findItemByUri(store, 'R:/库/moved/photo1.jpg'))
  assertEqual(moved1.id, photo1.id, '扫描③b：认领保持条目 id 不变')
  assertEqual(moved1.status, 'active', '扫描③b：认领条目恢复 active')
  assertEqual(
    (await store.listAttachments({ tagId: 'tag-x' })).map((a) => a.itemId),
    [photo1.id],
    '扫描③b：标签随条目 id 原样保留'
  )

  // 另一工作区同根、discard 策略：消失的 video 直接删除（photo1 已被认领恢复 active，不受影响）
  await store.createWorkspace({ id: 'ws-discard', name: '丢弃库', createdAt: T0 })
  await mountWorkspaceRoot(svc, 'ws-discard', 'R:/库')
  const s4: ScanSummary = await scanWorkspace(svc, fsD, 'ws-discard', { missing: 'discard' })
  assertEqual(
    s4,
    {
      scannedRoots: 1,
      nodesCreated: 2, // 根 + moved
      nodesRemoved: 0,
      itemsCreated: 0, // 三个文件已全局存在
      itemsRelocated: 0,
      itemsUpdated: 0,
      itemsMissing: 0,
      itemsDiscarded: 1, // 仅 video（先前已 missing、磁盘已无）
      dirsUnreadable: 0,
      filesUnreadable: 0,
    },
    '扫描④：discard 策略删除消失条目（已认领的 photo1 不受影响）'
  )
  assert((await store.getItem(video.id)) === null, '扫描④：video 条目已删除')
  assert((await store.getItem(photo1.id)) !== null, '扫描④：被认领的 photo1 保留')
  assertEqual(
    (await store.listAttachments({ tagId: 'tag-x' })).length,
    1,
    '扫描④：photo1 的挂载（留念）随认领保留'
  )

  const browseFinal = (await browseWorkspace(svc, 'ws-scan')).items
  assertEqual(
    browseFinal.map((h) => asFile(h.item).sourceUri).sort(),
    ['R:/库/moved/photo1.jpg', 'R:/库/photo2.jpg', 'R:/库/photo3.jpg'],
    '收尾：ws-scan 浏览仅含现存目录内条目（missing/节点消失者不出现在视图）'
  )

  // ---- ⑤ 不可读目录：跳过其子树、不影响其余部分，且**不参与消失判定** ----------
  // 场景：R:/库/locked 下原有文件，本次遍历读不到该目录（权限/IO）。
  // 期望：扫描不抛错；摘要报 dirsUnreadable=1；该子树的节点行与条目保持原状
  //     （既不被当"消失目录"删节点，也不被当"消失文件"标 missing）。
  const fsLocked: FileSystem = createMemoryFileSystem(
    {
      'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED',
      'R:/库/photo3.jpg': 'JPGDATA-333-CCCCCCCCCCCCCCCC',
      'R:/库/moved/photo1.jpg': 'JPGDATA-111-AAAAAAAAAAAAAAAA',
      'R:/库/locked/deep.jpg': 'JPGDATA-999-LOCKEDLOCKEDLOCKED',
    },
    { unreadable: ['R:/库/locked'] }
  )
  // 先让 locked 正常入库一次（建立节点与条目），再模拟不可读
  const fsLockedFirst = createMemoryFileSystem({
    'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED',
    'R:/库/photo3.jpg': 'JPGDATA-333-CCCCCCCCCCCCCCCC',
    'R:/库/moved/photo1.jpg': 'JPGDATA-111-AAAAAAAAAAAAAAAA',
    'R:/库/locked/deep.jpg': 'JPGDATA-999-LOCKEDLOCKEDLOCKED',
  })
  await scanWorkspace(svc, fsLockedFirst, 'ws-scan')
  const lockedItem = asFile(await findItemByUri(store, 'R:/库/locked/deep.jpg'))
  const s5 = await scanWorkspace(svc, fsLocked, 'ws-scan')
  assertEqual(s5.dirsUnreadable, 1, '⑤ 不可读目录计入摘要（dirsUnreadable=1）')
  assertEqual(s5.nodesRemoved, 0, '⑤ 不可读子树内的节点行不被当"消失目录"删除')
  assertEqual(s5.itemsMissing, 0, '⑤ 不可读子树内的条目不被当"消失文件"标 missing')
  assert(
    (await store.listPathNodes({ workspaceId: 'ws-scan' })).some((n) => n.dirPath === 'R:/库/locked'),
    '⑤ 不可读目录的节点行仍在（下次扫描可继续）'
  )
  assertEqual(
    (await store.getItem(lockedItem.id))?.kind === 'file'
      ? ((await store.getItem(lockedItem.id)) as FileItem).status
      : null,
    'active',
    '⑤ 不可读子树内的条目仍为 active'
  )
  assertEqual(
    (await browseWorkspace(svc, 'ws-scan')).total,
    4,
    '⑤ 不可读子树内的条目仍在视图内（4 条：photo1/2/3 + locked/deep）'
  )

  // ---- ⑥ 文件级容错：单个文件读不到，不得让整次扫描回滚，也不得被当"消失" ----------
  // 场景：遍历见到 bad.jpg，但 hash/readHead 失败（权限/IO）。此前这一处会 reject → 整事务回滚
  //     （"什么都没扫到"）；文件级 try/catch 后：跳过该文件、计入 filesUnreadable、其余照常。
  const fsBadFile = createMemoryFileSystem(
    {
      'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED',
      'R:/库/photo3.jpg': 'JPGDATA-333-CCCCCCCCCCCCCCCC',
      'R:/库/moved/photo1.jpg': 'JPGDATA-111-AAAAAAAAAAAAAAAA',
      'R:/库/locked/deep.jpg': 'JPGDATA-999-LOCKEDLOCKEDLOCKED',
      'R:/库/bad.jpg': 'JPGDATA-BAD-0000000000000000',
    },
    { badFiles: ['R:/库/bad.jpg'] }
  )
  const s6 = await scanWorkspace(svc, fsBadFile, 'ws-scan')
  assertEqual(s6.filesUnreadable, 1, '⑥ 不可读文件计入摘要（filesUnreadable=1）')
  assertEqual(s6.itemsCreated, 0, '⑥ 读不到的文件不建条目')
  assertEqual(s6.itemsMissing, 0, '⑥ 读不到 ≠ 已消失：不被标 missing')
  assertEqual(s6.nodesRemoved, 0, '⑥ 扫描未回滚（其余部分照常完成）')
  assertEqual(
    (await store.queryItems({ underDirPath: 'R:/库/bad.jpg' })).length,
    0,
    '⑥ bad.jpg 未入库'
  )
  assertEqual(
    (await browseWorkspace(svc, 'ws-scan')).total,
    4,
    '⑥ 其余 4 条不受影响（对比：修复前这里整次扫描回滚，4 条的状态也不会更新）'
  )

  // ---- ⑦ 用户排除的目录消失：节点行保留，排除意图不随目录消失而丢失（D27） ----------
  const fsKeepout = createMemoryFileSystem({
    'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED',
    'R:/库/photo3.jpg': 'JPGDATA-333-CCCCCCCCCCCCCCCC',
    'R:/库/moved/photo1.jpg': 'JPGDATA-111-AAAAAAAAAAAAAAAA',
    'R:/库/locked/deep.jpg': 'JPGDATA-999-LOCKEDLOCKEDLOCKED',
    'R:/库/keepout/secret.jpg': 'JPGDATA-KEEP-KEEPKEEPKEEPKEEP',
  })
  const s7a = await scanWorkspace(svc, fsKeepout, 'ws-scan')
  assertEqual(s7a.nodesCreated, 1, '⑦ 新目录 keepout 入库（节点行建立）')
  assertEqual(s7a.itemsCreated, 1, '⑦ keepout/secret.jpg 入库')
  await store.setPathNodeState('ws-scan', 'R:/库/keepout', 'excluded')
  const fsKeepoutGone = createMemoryFileSystem({
    'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED',
    'R:/库/photo3.jpg': 'JPGDATA-333-CCCCCCCCCCCCCCCC',
    'R:/库/moved/photo1.jpg': 'JPGDATA-111-AAAAAAAAAAAAAAAA',
    'R:/库/locked/deep.jpg': 'JPGDATA-999-LOCKEDLOCKEDLOCKED',
  })
  const s7b = await scanWorkspace(svc, fsKeepoutGone, 'ws-scan')
  assertEqual(s7b.nodesRemoved, 0, '⑦ 被排除目录消失：节点行保留（不计入 nodesRemoved）')
  assertEqual(
    (await store.listPathNodes({ workspaceId: 'ws-scan' })).find((n) => n.dirPath === 'R:/库/keepout')
      ?.state,
    'excluded',
    '⑦ 保留的节点行仍为 excluded（用户意图是资产）'
  )
  assertEqual(s7b.itemsMissing, 1, '⑦ 该目录下的文件确实消失了 → 条目按策略标 missing')
  const s7c = await scanWorkspace(svc, fsKeepout, 'ws-scan')
  assertEqual(s7c.nodesCreated, 0, '⑦ 目录重现：不新建节点（既有行仍在）')
  assertEqual(
    (await browseWorkspace(svc, 'ws-scan', { underDirPath: 'R:/库/keepout' })).total,
    0,
    '⑦ 目录重现后其直接条目仍被排除（排除不会"自己回来"）'
  )

  // ---- ⑧ 遍历与采集之间消失（walk 见到、stat 报不存在）：不炸、不误记不可读 ----------
  const fsGhost = createMemoryFileSystem(
    {
      'R:/库/photo2.jpg': 'JPGDATA-222-BBBBBBBBBBBBBBBB-CHANGED',
      'R:/库/photo3.jpg': 'JPGDATA-333-CCCCCCCCCCCCCCCC',
      'R:/库/moved/photo1.jpg': 'JPGDATA-111-AAAAAAAAAAAAAAAA',
      'R:/库/locked/deep.jpg': 'JPGDATA-999-LOCKEDLOCKEDLOCKED',
      'R:/库/keepout/secret.jpg': 'JPGDATA-KEEP-KEEPKEEPKEEPKEEP',
    },
    { ghostFiles: ['R:/库/photo2.jpg'] }
  )
  const s8 = await scanWorkspace(svc, fsGhost, 'ws-scan')
  assertEqual(s8.filesUnreadable, 0, '⑧ 消失（不是读不到）不计入 filesUnreadable')
  assertEqual(s8.itemsMissing, 1, '⑧ 消失的既有条目按 keep 策略标 missing')
  assertEqual(s8.itemsCreated, 0, '⑧ 不因竞态新建条目')
  assertEqual(s8.nodesRemoved, 0, '⑧ 扫描未回滚（目录与其余条目照常）')
  assertEqual(
    asFile(await findItemByUri(store, 'R:/库/photo2.jpg')).status,
    'missing',
    '⑧ photo2 条目状态 missing'
  )

  console.log(`\nSCAN CHECKS PASSED（断言执行 ${executedAsserts} 个）`)
}
