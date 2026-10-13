/**
 * 文件操作校准场景（适配器无关）：应用内移动/改名**直改库**（条目与节点行重定基、
 * 免扫，保 id 保标签、excluded 意图随行、目的地祖先节点链补齐）、删除**即删**
 * （条目记录级联清除，不标缺失）、来源根与目录自嵌套守卫，逐项断言。
 * 由 scripts/s38-fileops-calibrate.ts 在 memory 与 sqlite 上各跑一遍。
 */

import type { FileItem, Id, Item } from '../src/domain/index.ts'
import { DomainError } from '../src/domain/index.ts'
import type { FileSystem, Store, Trash } from '../src/ports/index.ts'
import { createMemoryFileSystem } from '../src/adapters/memory/index.ts'
import {
  browseWorkspace,
  mountWorkspaceRoot,
  moveFsEntry,
  scanWorkspace,
  tagItem,
  trashFsEntry
} from '../src/application/index.ts'
import type { AppServices } from '../src/application/index.ts'

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

function asFile(it: Item): FileItem {
  if (it.kind !== 'file') throw new Error(`期望 file 条目：${it.id}`)
  return it
}

/** 精确路径查条目（underDirPath 按路径段匹配，文件路径即等值）。 */
async function findByUri(store: Store, uri: string): Promise<Item | null> {
  const hits = await store.queryItems({ underDirPath: uri })
  return hits.find((h) => h.item.kind === 'file' && h.item.sourceUri === uri)?.item ?? null
}

async function expectInvalid(p: Promise<unknown>, msg: string): Promise<void> {
  try {
    await p
    assert(false, msg)
  } catch (e) {
    assert(e instanceof DomainError && e.code === 'INVALID', `${msg}（须为 INVALID，实为 ${String(e)}）`)
  }
}

const SEED = {
  'R:/库/a.jpg': 'JPG-A-AAAAAAAAAAAAAAAAAAAA',
  'R:/库/del.txt': 'TXT-DEL',
  'R:/库/sub/b.jpg': 'JPG-B-BBBBBBBBBBBBBBBBBBBB',
  'R:/库/sub/c.jpg': 'JPG-C-CCCCCCCCCCCCCCCCCCCC'
} as const

export async function runFileOpsScenario(store: Store): Promise<void> {
  const svc: AppServices = { store, clock: { now: () => T0 }, idGen: makeIdGen() }
  const WS: Id = 'ws-ops'
  await store.createWorkspace({ id: WS, name: '文件操作库', createdAt: T0 })
  await mountWorkspaceRoot(svc, WS, 'R:/库')

  const fsA: FileSystem = createMemoryFileSystem(SEED)
  const s1 = await scanWorkspace(svc, fsA, WS)
  assertEqual(s1.itemsCreated, 4, '扫描：4 个条目入库')

  const a1 = asFile((await findByUri(store, 'R:/库/a.jpg'))!)
  await store.createTag({ id: 'tag-x', name: '留存', createdAt: T0 })
  await tagItem(svc, a1.id, ['tag-x'])

  // ① 改名（免扫直改）：保 id、保标签、title 随文件名、旧路径无残留。
  // fs 传「移动前」世界：用例先 stat(from) 再 rename（memory fs 原地变更到移动后）。
  const r1 = await moveFsEntry(svc, fsA, WS, 'R:/库/a.jpg', 'R:/库', 'a2.jpg')
  assertEqual(r1.to, 'R:/库/a2.jpg', '改名：返回落位路径')
  const a2 = asFile((await findByUri(store, 'R:/库/a2.jpg'))!)
  assertEqual(a2.id, a1.id, '改名：条目 id 不变')
  assertEqual(a2.title, 'a2.jpg', '改名：title 随文件名（扫描同口径）')
  assert((await findByUri(store, 'R:/库/a.jpg')) == null, '改名：旧路径无条目残留')
  const tagsOfA = (await store.queryItems({ underDirPath: 'R:/库/a2.jpg' }))[0]?.tags ?? []
  assert(tagsOfA.some((t) => t.id === 'tag-x'), '改名：标签保留')

  // ② 移动目录到「扫描从未见过的新目录」：节点行搬动 + excluded 意图保真 + 祖先链补齐。
  // nested/ 以一个占位文件预置（rename 要求目标父目录存在），它不入库（不重扫）。
  await store.setPathNodeState(WS, 'R:/库/sub', 'excluded')
  const fsC: FileSystem = createMemoryFileSystem({
    'R:/库/a2.jpg': 'JPG-A-AAAAAAAAAAAAAAAAAAAA',
    'R:/库/del.txt': 'TXT-DEL',
    'R:/库/nested/keep.tmp': 'TMP',
    'R:/库/sub/b.jpg': 'JPG-B-BBBBBBBBBBBBBBBBBBBB',
    'R:/库/sub/c.jpg': 'JPG-C-CCCCCCCCCCCCCCCCCCCC'
  })
  const r2 = await moveFsEntry(svc, fsC, WS, 'R:/库/sub', 'R:/库/nested', 'sub')
  assertEqual(r2.to, 'R:/库/nested/sub', '移动：返回落位路径')
  const nodes = await store.listPathNodes({ workspaceId: WS })
  assert(!nodes.some((n) => n.dirPath === 'R:/库/sub'), '移动：旧目录节点行已搬走')
  const movedNode = nodes.find((n) => n.dirPath === 'R:/库/nested/sub')
  assert(movedNode != null && movedNode.state === 'excluded', '移动：节点行保留 excluded 意图')
  assert(nodes.some((n) => n.dirPath === 'R:/库/nested'), '移动：目的地祖先节点链已补齐')
  assert((await findByUri(store, 'R:/库/nested/sub/b.jpg')) != null, '移动：子条目来源已重定基')
  const browse2 = (await browseWorkspace(svc, WS)).items
  const uris = browse2.map((h) => (h.item.kind === 'file' ? h.item.sourceUri : null))
  assert(!uris.includes('R:/库/nested/sub/b.jpg'), '移动：excluded 子树不回浏览视图')
  assert(uris.includes('R:/库/a2.jpg'), '移动：未涉条目照常可见')

  // ③ 删除文件（删除即删除）：文件进回收站，条目记录级联清除，不标缺失
  const trashed: string[] = []
  const trash: Trash = { trash: async (p) => void trashed.push(p) }
  await trashFsEntry(svc, fsC, trash, WS, 'R:/库/del.txt')
  assertEqual(trashed, ['R:/库/del.txt'], '删除：文件进回收站')
  assert((await findByUri(store, 'R:/库/del.txt')) == null, '删除：条目记录已清除（不标缺失）')

  // ④ 删除目录：整棵子树的条目级联清除；节点行不动（照旧由扫描消失判定按 D27 处理）
  await trashFsEntry(svc, fsC, trash, WS, 'R:/库/nested/sub')
  assert((await findByUri(store, 'R:/库/nested/sub/b.jpg')) == null, '删目录：子条目 b 已清除')
  assert((await findByUri(store, 'R:/库/nested/sub/c.jpg')) == null, '删目录：子条目 c 已清除')
  const nodes2 = await store.listPathNodes({ workspaceId: WS })
  assert(nodes2.some((n) => n.dirPath === 'R:/库/nested/sub'), '删目录：节点行不动（扫描消失判定的事）')

  // ⑤ 守卫：来源根本身不可移动/删除；目录不可移入自身子树
  await expectInvalid(moveFsEntry(svc, fsC, WS, 'R:/库', 'R:/库/x'), '守卫：来源根不可移动')
  await expectInvalid(trashFsEntry(svc, fsC, trash, WS, 'R:/库'), '守卫：来源根不可删除')
  await expectInvalid(
    moveFsEntry(svc, fsC, WS, 'R:/库/nested', 'R:/库/nested/sub', 'x'),
    '守卫：目录不可移入自身子树'
  )

  console.log(`—— 场景通过（断言 ${executedAsserts} 项）`)
}
