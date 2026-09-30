/**
 * S3.7 顺序窗口校准场景（适配器无关）：详情页翻页与前后预览的数据面。
 *
 * 钉住五件事：
 * ① 窗口与 queryItems **同解**：同一 scope 下，窗口就是序列里锚条目前后各 radius 条（逐 id 比对）；
 * ② 位置与总数可信（index / total），边界（首条 / 末条）不越界；
 * ③ 锚条目不在序列内 → index = -1、窗口为空（读宽松，不抛错）；
 * ④ 应用层口径：只认素材条目（kinds = file，锚条目不进浏览序列）、成员条件下沉（directNodeStateIn）、
 *    radius 钳制；
 * ⑤ 视图筛选参与序列（标签筛选下窗口随之缩小）——"详情页的下一张"与网格里的下一张是同一个序列。
 *
 * 运行方：scripts/s37-window-calibrate.ts（memory 与 sqlite 双跑）。
 */

import type { FileItem, Id } from '../src/domain/index.ts'
import type { ItemOrderField, Store } from '../src/ports/index.ts'
import { itemWindow, tagItem } from '../src/application/index.ts'
import type { AppServices } from '../src/application/index.ts'

const T0 = '2026-09-30T00:00:00.000Z'
const WS = 'ws-window'
const OTHER_WS = 'ws-other'
/** 成员条目数：必须显著大于 radius，才能同时覆盖"居中窗口"与"两端边界"。 */
const MEMBER_COUNT = 12
const RADIUS = 2

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

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function at(seconds: number): string {
  return `2026-09-30T00:00:${pad(seconds)}.000Z`
}

function fileItem(id: Id, sourceUri: string, createdAt: string): FileItem {
  return {
    kind: 'file',
    id,
    title: sourceUri.slice(sourceUri.lastIndexOf('/') + 1),
    sourceUri,
    contentHash: null,
    size: 1024,
    fileModifiedAt: createdAt,
    status: 'active',
    createdAt,
  }
}

/** scope：与网格同款（成员条件 + 素材条目），三种排序键 × 两方向都用它比对。 */
function scopeOf(order: ItemOrderField, orderDir: 'asc' | 'desc') {
  return {
    kinds: ['file' as const],
    directNodeStateIn: { workspaceId: WS, state: 'included' as const },
    order,
    orderDir,
  }
}

export async function runWindowScenario(store: Store): Promise<void> {
  const svc: AppServices = { store, clock: { now: () => T0 }, idGen: { newId: () => 'gen' } }
  await store.createWorkspace({ id: WS, name: '窗口库', createdAt: T0 })
  await store.createWorkspace({ id: OTHER_WS, name: '另一库', createdAt: T0 })
  await store.addWorkspaceRoot(WS, 'R:/库')
  await store.addWorkspaceRoot(OTHER_WS, 'R:/另一库')
  await store.ensurePathNode(WS, 'R:/库', 'included')
  await store.ensurePathNode(WS, 'R:/库/子', 'included')
  await store.ensurePathNode(OTHER_WS, 'R:/另一库', 'included')

  // 成员：w-01..w-12（createdAt 与 title 同向递增，id 亦同向 → 三种排序键的顺序一致且确定）
  const memberIds: Id[] = []
  for (let i = 1; i <= MEMBER_COUNT; i++) {
    const id = `w-${pad(i)}`
    memberIds.push(id)
    await store.createItem(fileItem(id, `R:/库/子/f${pad(i)}.jpg`, at(i)))
  }
  // 非成员：本工作区根下但无节点行（归属缺失）；锚条目（不是内容）；别的库的素材
  await store.createItem(fileItem('x-noNode', 'R:/库/缺节点/o.jpg', at(13)))
  await store.createItem({ kind: 'anchor', id: 'x-anchor', title: '作品锚', createdAt: at(14) })
  await store.createItem(fileItem('x-other', 'R:/另一库/other.jpg', at(15)))

  // ---- ① 居中窗口：锚条目前后各 RADIUS 条，位置与总数可信 -------------------
  const centered = await itemWindow(svc, 'w-06', {
    workspaceId: WS,
    order: 'createdAt',
    orderDir: 'asc',
    radius: RADIUS,
  })
  assertEqual(
    centered.items.map((h) => h.item.id),
    ['w-04', 'w-05', 'w-06', 'w-07', 'w-08'],
    '① 居中窗口 = 锚条目前后各 2 条（含自身）'
  )
  assertEqual(centered.index, 5, '① index = 锚条目在序列中的 0 起位置')
  assertEqual(centered.total, MEMBER_COUNT, '① total = 成员总数（非成员不计）')
  assertEqual(centered.loose, false, '① 正常路径不触发回落')

  // ---- ② 两端边界：不越界，窗口按可用条数收缩 ------------------------------
  const head = await itemWindow(svc, 'w-01', { workspaceId: WS, order: 'createdAt', orderDir: 'asc', radius: RADIUS })
  assertEqual(head.items.map((h) => h.item.id), ['w-01', 'w-02', 'w-03'], '② 首条：窗口向一侧收缩')
  assertEqual(head.index, 0, '② 首条 index = 0')
  const tail = await itemWindow(svc, 'w-12', { workspaceId: WS, order: 'createdAt', orderDir: 'asc', radius: RADIUS })
  assertEqual(tail.items.map((h) => h.item.id), ['w-10', 'w-11', 'w-12'], '② 末条：窗口向一侧收缩')
  assertEqual(tail.index, MEMBER_COUNT - 1, '② 末条 index = 总数 − 1')

  // ---- ③ 与 queryItems 同解：三种排序键 × 两方向，窗口逐 id 等于序列切片 ----
  const ORDERS: Array<[ItemOrderField, 'asc' | 'desc']> = [
    ['createdAt', 'asc'],
    ['createdAt', 'desc'],
    ['title', 'asc'],
    ['title', 'desc'],
    ['sourceUri', 'asc'],
    ['sourceUri', 'desc'],
  ]
  for (const [order, orderDir] of ORDERS) {
    const all = (
      await store.queryItems(scopeOf(order, orderDir))
    ).map((h) => h.item.id)
    const anchor = all[4]!
    const win = await itemWindow(svc, anchor, { workspaceId: WS, order, orderDir, radius: RADIUS })
    assertEqual(win.items.map((h) => h.item.id), all.slice(2, 7), `③ 窗口 = 序列切片（${order} ${orderDir}）`)
    assertEqual([win.index, win.total], [4, all.length], `③ 位置与总数（${order} ${orderDir}）`)
  }

  // ---- ④ 锚条目不在视图序列内：退到"全部素材"，而不是死胡同 ------------------
  const anchorOut = await itemWindow(svc, 'x-anchor', { workspaceId: WS, radius: RADIUS })
  assertEqual(
    [anchorOut.index, anchorOut.items.length],
    [-1, 0],
    '④ 锚条目不是内容：退到全部素材后仍无序列 → index=-1、窗口为空'
  )
  assertEqual(anchorOut.loose, true, '④ 如实标记"已退到全部素材序列"')
  assertEqual(anchorOut.total, MEMBER_COUNT + 2, '④ 退到全部素材后的总数（锚条目始终不计入）')
  const otherOut = await itemWindow(svc, 'x-noNode', { workspaceId: WS, radius: RADIUS })
  assertEqual(otherOut.loose, true, '④ 无节点归属的条目不在本工作区序列 → 触发回落')
  assertEqual(otherOut.index >= 0, true, '④ 回落之后翻页仍可用（不再是死胡同）')
  const noCtx = await itemWindow(svc, 'x-anchor', { radius: RADIUS })
  assertEqual(noCtx.loose, false, '④ 上下文本就无视图条件 → 不重试（loose 保持 false）')

  // ---- ⑤ 视图筛选参与序列：标签筛选下窗口随之缩小 --------------------------
  await store.createTag({ id: 'tag-hot', name: '精选', createdAt: T0 })
  await tagItem(svc, 'w-03', ['tag-hot'])
  await tagItem(svc, 'w-07', ['tag-hot'])
  const filtered = await itemWindow(svc, 'w-07', {
    workspaceId: WS,
    order: 'createdAt',
    orderDir: 'asc',
    withAllTags: ['tag-hot'],
    radius: RADIUS,
  })
  assertEqual(filtered.items.map((h) => h.item.id), ['w-03', 'w-07'], '⑤ 标签筛选下序列只剩命中项')
  assertEqual([filtered.index, filtered.total], [1, 2], '⑤ 筛选后的位置与总数')
  assertEqual(filtered.loose, false, '⑤ 命中筛选的条目走原序列（不回落）')
  // 真实场景：从筛选视图点开某条目后，它不再满足筛选（打标被卸掉等）→ 退到全部素材而不是死胡同
  const outOfFilter = await itemWindow(svc, 'w-01', {
    workspaceId: WS,
    order: 'createdAt',
    orderDir: 'asc',
    withAllTags: ['tag-hot'],
    radius: RADIUS,
  })
  assertEqual(outOfFilter.loose, true, '⑤ 不满足筛选的锚条目触发回落')
  assertEqual(
    outOfFilter.items.map((h) => h.item.id),
    ['w-01', 'w-02', 'w-03'],
    '⑤ 回落按"全部素材 + 原排序"给出窗口'
  )
  assertEqual(outOfFilter.index, 0, '⑤ 回落后的位置同样可信')

  // ---- ⑥ 跨工作区序列（无成员前提）：素材条目全在内，锚条目仍不进序列 --------
  const cross = await itemWindow(svc, 'x-other', { order: 'createdAt', orderDir: 'asc', radius: RADIUS })
  assertEqual(cross.total, MEMBER_COUNT + 2, '⑥ 跨工作区总数 = 全部素材条目（成员 + 无节点 + 别的库）')
  assertEqual(cross.index, MEMBER_COUNT + 1, '⑥ 别的库条目在跨工作区序列中的位置')
  assert(
    cross.items.some((h) => h.item.id === 'x-other'),
    '⑥ 窗口含锚条目自身（它在序列内）'
  )
  assert(
    !cross.items.some((h) => h.item.id === 'x-anchor'),
    '⑥ 锚条目始终不进序列'
  )

  // ---- ⑦ radius 钳制（应用层口径：1..24） ---------------------------------
  const wide = await itemWindow(svc, 'w-06', { workspaceId: WS, order: 'createdAt', orderDir: 'asc', radius: 99 })
  assertEqual(wide.items.length, MEMBER_COUNT, '⑦ radius 超出上限被钳制（99 → 24，本场景取尽 12 条）')
  const tiny = await itemWindow(svc, 'w-06', { workspaceId: WS, order: 'createdAt', orderDir: 'asc', radius: 0 })
  assertEqual(tiny.items.map((h) => h.item.id), ['w-05', 'w-06', 'w-07'], '⑦ radius 下界 1：0 被钳到 1（锚条目 ±1 条）')

  console.log(`\nWINDOW CHECKS PASSED（断言执行 ${executedAsserts} 个）`)
}
