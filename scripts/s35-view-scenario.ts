/**
 * S3.5 浏览窗口校准场景（适配器无关）：成员派生条件下的查询语义。
 *
 * 防的是 2026-09-12 修复的缺陷——**先取窗口再筛成员**：存储按 order/limit 取 120 条，
 * 应用层再剔除非成员，于是窗口里剩几条就显示几条，可见条目数随排序键与方向变化。
 * 本场景把"排序无关 + 分页遍历并集 = 成员全集 + 非成员不占窗口"钉成断言，
 * 并顺带校准 SQL 译文（parentDirExpr）与领域纯函数 parentDir 的行为等价：
 * SQL 无法用纯函数表达父目录，靠**同一场景双跑**（memory / sqlite）保证同解。
 *
 * 运行方：scripts/s35-view-calibrate.ts（memory 与 sqlite 双跑）。
 * 这不是测试设施，只用于校准理解——断言失败即抛错中止。
 */

import type { FileItem, Id } from '../src/domain/index.ts'
import { parentDir } from '../src/domain/index.ts'
import type { ItemOrderField, ItemsQuery, Store } from '../src/ports/index.ts'
import { browseWorkspace, visibilitySummary } from '../src/application/index.ts'
import type { AppServices } from '../src/application/index.ts'

const T0 = '2026-09-12T00:00:00.000Z'
const WS = 'ws-view'
const OTHER_WS = 'ws-other'
/** 成员条目数：必须显著大于下面用的分页窗口，才能暴露"窗口里筛成员"的缺陷。 */
const MEMBER_COUNT = 25
const PAGE = 7

/** 浏览成员条件（可见性）：条目直接节点在该工作区且 included。 */
const VIS: NonNullable<ItemsQuery['directNodeStateIn']> = { workspaceId: WS, state: 'included' }

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

function fileItem(id: Id, sourceUri: string, createdAt = T0): FileItem {
  return {
    kind: 'file',
    id,
    title: sourceUri.slice(sourceUri.lastIndexOf('/') + 1),
    sourceUri,
    contentHash: null,
    size: 1024,
    fileModifiedAt: T0,
    status: 'active',
    createdAt,
  }
}

/** 排序组合：覆盖三个排序键 × 两方向（旧缺陷在这些组合下给出不同数量）。 */
const ORDERS: Array<[ItemOrderField, 'asc' | 'desc']> = [
  ['createdAt', 'desc'],
  ['createdAt', 'asc'],
  ['title', 'asc'],
  ['title', 'desc'],
  ['sourceUri', 'asc'],
  ['sourceUri', 'desc'],
]

export async function runViewScenario(store: Store): Promise<void> {
  let seq = 0
  const svc: AppServices = { store, clock: { now: () => T0 }, idGen: { newId: () => `gen-${++seq}` } }

  // ---- 种子：两个工作区 + 一个被排除节点 + 一个无节点目录（孤儿） -----------
  await store.createWorkspace({ id: WS, name: '窗口库', createdAt: T0 })
  await store.createWorkspace({ id: OTHER_WS, name: '另一库', createdAt: T0 })

  await store.addWorkspaceRoot(WS, 'R:/库')
  await store.addWorkspaceRoot(OTHER_WS, 'R:/另一库')

  // 节点：根与子目录 included；R:/库/ex 显式 excluded（其直接条目退出视图）
  await store.ensurePathNode(WS, 'R:/库', 'included')
  await store.ensurePathNode(WS, 'R:/库/ex', 'excluded')
  await store.ensurePathNode(WS, 'R:/库/深', 'included')
  await store.ensurePathNode(WS, 'R:/库/深/嵌套/层级/很深/的路径', 'included')
  await store.ensurePathNode(WS, 'R:/库/边界', 'included')
  await store.ensurePathNode(WS, 'R:/库/边界/中文 目录', 'included')
  await store.ensurePathNode(WS, 'R:/库/边界2', 'included') // 同前缀兄弟目录（路径段匹配的靶子）
  await store.ensurePathNode(OTHER_WS, 'R:/另一库', 'included')

  // 成员：R:/库 直接子文件 MEMBER_COUNT 个（createdAt 故意同值 → 排序并列，考稳定序）
  const memberIds: Id[] = []
  for (let i = 1; i <= MEMBER_COUNT; i++) {
    const id = `m-${pad(i)}`
    memberIds.push(id)
    await store.createItem(fileItem(id, `R:/库/f${pad(i)}.jpg`))
  }
  // 边界路径样本（领域纯函数与 SQL 译文必须同解）：深嵌套 / 中文+空格 / 点号密集
  const deep = fileItem('m-deep', 'R:/库/深/嵌套/层级/很深/的路径/deep.jpg')
  const cjk = fileItem('m-cjk', 'R:/库/边界/中文 目录/文 件 01.txt')
  const dotted = fileItem('m-dotted', 'R:/库/边界/1.2.3.tar.gz')
  for (const it of [deep, cjk, dotted]) await store.createItem(it)
  const allMemberIds = [...memberIds, deep.id, cjk.id, dotted.id].sort()

  // 非成员干扰项（旧实现里它们会占用 order/limit 窗口）
  await store.createItem(fileItem('x-excluded', 'R:/库/ex/hidden.jpg')) // 节点 excluded
  await store.createItem(fileItem('x-orphan', 'R:/库/无节点/orphan.jpg')) // 无节点行
  await store.createItem(fileItem('x-other-ws', 'R:/另一库/other.jpg')) // 另一工作区（同节点集不共享）
  await store.createItem({
    kind: 'anchor',
    id: 'x-anchor',
    title: '作品锚',
    createdAt: T0,
  })
  const decoyIds = ['x-excluded', 'x-orphan', 'x-other-ws', 'x-anchor']

  // ---- ① 成员总数与排序无关 ---------------------------------------------
  assertEqual(allMemberIds.length, MEMBER_COUNT + 3, '① 成员全集规模（25 直接子文件 + 3 边界样本）')
  for (const [order, orderDir] of ORDERS) {
    const total = await store.countItems({ directNodeStateIn: VIS, order, orderDir })
    assertEqual(total, allMemberIds.length, `① 成员总数与排序无关（${order} ${orderDir}）`)
  }

  // ---- ② 分页窗口作用在成员集上：逐页遍历并集 = 成员全集 -------------------
  for (const [order, orderDir] of ORDERS) {
    const seen: Id[] = []
    let offset = 0
    for (;;) {
      const page = await store.queryItems({
        directNodeStateIn: VIS,
        order,
        orderDir,
        limit: PAGE,
        offset,
      })
      if (page.length === 0) break
      seen.push(...page.map((h) => h.item.id))
      offset += PAGE
      if (offset > 200) break // 防呆：分页不收敛即失败
    }
    assertEqual(seen.length, allMemberIds.length, `② 分页遍历覆盖全部成员（${order} ${orderDir}）`)
    assertEqual(seen.slice().sort(), allMemberIds, `② 分页遍历无重复无遗漏（${order} ${orderDir}）`)
    assert(
      !seen.some((id) => decoyIds.includes(id)),
      `② 非成员不占窗口、也不出现在任何页（${order} ${orderDir}）`
    )
  }

  // ---- ③ 首屏窗口规模：limit 只裁剪成员，不被干扰项挤掉 -------------------
  const firstPage = await store.queryItems({ directNodeStateIn: VIS, limit: PAGE })
  assertEqual(firstPage.length, PAGE, '③ 首页恰好 PAGE 条成员（干扰项不占用窗口）')
  assert(
    firstPage.every((h) => h.item.kind === 'file'),
    '③ 窗口内条目全为 file（锚条目不进工作区视图）'
  )

  // ---- ④ 应用层浏览：items 与 total 同源，且投影不改变计数 ----------------
  const view = await browseWorkspace(svc, WS)
  assertEqual(view.total, allMemberIds.length, '④ browse.total = 成员总数')
  assertEqual(
    view.items.map((h) => h.item.id).sort(),
    allMemberIds,
    '④ browse.items（无 limit）= 成员全集'
  )
  const scoped = await browseWorkspace(svc, WS, { limit: PAGE })
  assertEqual(scoped.items.length, PAGE, '④ browse 带 limit：本页条数 = limit')
  assertEqual(scoped.total, allMemberIds.length, '④ browse 带 limit：total 仍是成员总数（不受分页影响）')

  // ---- ⑤ 排除节点：只隐藏直接条目（不级联），兄弟目录不受影响 -------------
  await store.setPathNodeState(WS, 'R:/库/深', 'included')
  await store.setPathNodeState(WS, 'R:/库/深/嵌套/层级/很深/的路径', 'excluded')
  assertEqual(
    await store.countItems({ directNodeStateIn: VIS }),
    allMemberIds.length - 1,
    '⑤ 排除深嵌套叶目录：仅其直接条目(deep)退出视图'
  )
  await store.setPathNodeState(WS, 'R:/库/深/嵌套/层级/很深/的路径', 'included')
  assertEqual(
    await store.countItems({ directNodeStateIn: VIS }),
    allMemberIds.length,
    '⑤ 恢复节点后成员还原'
  )

  // ---- ⑥ 目录范围（sourceUriPrefix）= 路径段匹配，非文本前缀 --------------
  const underBoundary = await store.queryItems({ sourceUriPrefix: 'R:/库/边界' })
  assertEqual(
    underBoundary.map((h) => h.item.id).sort(),
    ['m-cjk', 'm-dotted'],
    '⑥ 目录范围命中该目录之下（不含同前缀兄弟目录 边界2）'
  )
  assertEqual(
    (await store.queryItems({ sourceUriPrefix: 'R:/库/边界2' })).length,
    0,
    '⑥ 同前缀兄弟目录独立（边界2 下无条目）'
  )
  assertEqual(
    (await store.queryItems({ sourceUriPrefix: 'R:/库/f01.jpg' })).map((h) => h.item.id),
    ['m-01'],
    '⑥ 精确路径亦命中（文件路径作范围 = 自身）'
  )
  // 目录范围 + 可见性组合：只看某节点子树，且仍受成员派生约束
  assertEqual(
    (
      await store.queryItems({ directNodeStateIn: VIS, sourceUriPrefix: 'R:/库/ex' })
    ).length,
    0,
    '⑥ 目录范围 ∩ 成员派生：被排除目录下即使有范围命中也不可见'
  )

  // ---- ⑦ 父目录派生：领域纯函数与适配器翻译同解 --------------------------
  // 每个样本断言"该条目可见 ⟺ parentDir(sourceUri) 恰为已 included 的节点"
  const samples = [
    deep.sourceUri,
    cjk.sourceUri,
    dotted.sourceUri,
    'R:/库/f01.jpg',
    'R:/库/ex/hidden.jpg',
    'R:/库/无节点/orphan.jpg',
  ]
  for (const uri of samples) {
    const hits = await store.queryItems({ directNodeStateIn: VIS, sourceUriPrefix: uri })
    const visible = hits.some((h) => h.item.kind === 'file' && h.item.sourceUri === uri)
    const expected = (await store.listPathNodes({ workspaceId: WS })).some(
      (n) => n.dirPath === parentDir(uri) && n.state === 'included'
    )
    assertEqual(visible, expected, `⑦ 可见性 ⟺ parentDir 命中 included 节点：[${uri}]`)
  }

  // ---- ⑧ 可见性摘要：把"看不到的条目"按原因归类，且三类之和 = 根下条目总数 ------
  const summary = await visibilitySummary(svc, WS)
  assertEqual(
    summary,
    { visible: allMemberIds.length, hiddenByExcluded: 1, nodeMissing: 1 },
    '⑧ 可见性摘要：28 可见 / 1 被排除 / 1 无节点归属（x-other-ws 与锚不计入）'
  )
  assertEqual(
    summary.visible + summary.hiddenByExcluded + summary.nodeMissing,
    30,
    '⑧ 摘要三类之和 = 本工作区来源根下的条目总数'
  )

  console.log(`\nVIEW CHECKS PASSED（断言执行 ${executedAsserts} 个）`)}
