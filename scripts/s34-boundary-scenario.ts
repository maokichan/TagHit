/**
 * 边界输入校准场景（适配器无关）：对外暴露面 = 契约端点的用例层，
 * 用敌意输入逐个敲打，断言"合法 → 归一化通过；非法 → DomainError（INVALID/CONFLICT/
 * NOT_FOUND），绝不炸进程、不落半行脏数据"。由 scripts/s34-boundary.ts 双跑。
 */

import type { Store } from '../src/ports/index.ts'
import type { FileSystem } from '../src/ports/index.ts'
import type { Id } from '../src/domain/index.ts'
import { DomainError } from '../src/domain/index.ts'
import { createMemoryFileSystem } from '../src/adapters/memory/index.ts'
import {
  browseWorkspace,
  createCollection,
  createGroup,
  createTag,
  createWorkspace,
  listWorkspaceNodes,
  listWorkspaceRoots,
  mountWorkspaceRoot,
  moveFsEntry,
  renameCollection,
  renameGroup,
  setNodeState,
  trashFsEntry,
} from '../src/application/index.ts'
import type { AppServices } from '../src/application/index.ts'

const T0 = '2026-09-12T00:00:00.000Z'

let executedAsserts = 0

function assert(cond: boolean, msg: string): void {
  executedAsserts++
  if (!cond) {
    console.error(`✗ ${msg}`)
    throw new Error(msg)
  }
  console.log(`ok  ${msg}`)
}

/** 断言 fn 抛出指定 DomainError code（信封会原样带出；绝不允许其他异常逃逸）。 */
async function assertDomain(fn: () => Promise<unknown>, code: string, msg: string): Promise<void> {
  executedAsserts++
  try {
    await fn()
  } catch (e) {
    if (e instanceof DomainError && e.code === code) {
      console.log(`ok  ${msg}`)
      return
    }
    const got = e instanceof DomainError ? e.code : `非 DomainError：${String(e)}`
    console.error(`✗ ${msg}\n    实际抛出：${got}`)
    throw new Error(msg)
  }
  console.error(`✗ ${msg}\n    未抛出任何错误`)
  throw new Error(msg)
}

function makeIdGen(): { newId(): Id } {
  let n = 0
  return { newId: () => `id-${++n}` }
}

export async function runBoundaryScenario(store: Store): Promise<void> {
  const svc: AppServices = { store, clock: { now: () => T0 }, idGen: makeIdGen() }

  // ── ① 名称类输入（工作区/标签/作品/组） ─────────────────────────────
  await assertDomain(() => createWorkspace(svc, ''), 'INVALID', '① 工作区空名 → INVALID')
  await assertDomain(() => createWorkspace(svc, '   '), 'INVALID', '① 工作区纯空白 → INVALID')
  await assertDomain(() => createWorkspace(svc, 'x'.repeat(101)), 'INVALID', '① 工作区超长（>100）→ INVALID')
  const ws = await createWorkspace(svc, '我的 库')
  assert(ws.name === '我的 库', '① 带空格/中文的合法名称原样通过（空格不是非法输入）')

  await assertDomain(() => createTag(svc, { name: '' }), 'INVALID', '① 标签空名 → INVALID')
  const tag = await createTag(svc, { name: '  风景 ' })
  assert(tag.name === '风景', '① 标签名 trim 归一')
  await assertDomain(() => createTag(svc, { name: '风景' }), 'CONFLICT', '① 标签重名（trim 后）→ CONFLICT')

  const collection = await createCollection(svc, '作品集')
  await assertDomain(() => renameCollection(svc, collection.id, ' '), 'INVALID', '① 作品改名纯空白 → INVALID')
  const group = await createGroup(svc, '组')
  await assertDomain(() => createGroup(svc, 'x'.repeat(101)), 'INVALID', '① 组名超长 → INVALID')
  await assertDomain(() => renameGroup(svc, group.id, ' '), 'INVALID', '① 组改名纯空白 → INVALID')

  // ── ② 来源根挂载：空路径 → INVALID；分隔符/尾斜杠归一 ────────────────
  await assertDomain(() => mountWorkspaceRoot(svc, ws.id, ''), 'INVALID', '② 挂载空路径 → INVALID')
  await assertDomain(() => mountWorkspaceRoot(svc, ws.id, '   '), 'INVALID', '② 挂载纯空白路径 → INVALID')
  await mountWorkspaceRoot(svc, ws.id, 'D:\\库\\')
  const roots = await listWorkspaceRoots(svc, ws.id)
  assert(roots.length === 1 && roots[0].path === 'D:/库', '② 反斜杠 + 尾分隔符挂载 → 归一为 D:/库')

  // ── ③ 节点可见性：越界 / 相对段穿透 / 未扫描节点 ─────────────────────
  await assertDomain(
    () => setNodeState(svc, ws.id, 'D:/其他', 'excluded'),
    'NOT_FOUND',
    '③ 根外路径 → NOT_FOUND'
  )
  await assertDomain(
    () => setNodeState(svc, ws.id, 'D:/库/../外部', 'excluded'),
    'NOT_FOUND',
    '③ .. 相对段穿透（词汇解析后越界）→ NOT_FOUND'
  )
  await assertDomain(
    () => setNodeState(svc, ws.id, 'D:\\库\\未扫描', 'excluded'),
    'NOT_FOUND',
    '③ 反斜杠 + 根内未扫描节点 → NOT_FOUND（适配器）'
  )
  assert((await listWorkspaceNodes(svc, 'ws-不存在')).length === 0, '③ 读宽松：未知工作区节点列表 = 空')

  // ── ④ 文件操作：越界 / 穿透 / 冲突 / 正常移动与删除 ──────────────────
  const fs: FileSystem = createMemoryFileSystem({
    'D:/库/a.jpg': 'AAAABBBB',
    'D:/库/存在.jpg': 'CCCCDDDD',
    'D:/库/sub': 'dir',
    'D:/秘密.txt': 'SECRET',
  })
  const trashPaths: string[] = []
  const trash = { trash: async (p: string) => void trashPaths.push(p) }

  await assertDomain(
    () => moveFsEntry(svc, fs, ws.id, 'D:/秘密.txt', 'D:/库'),
    'NOT_FOUND',
    '④ 移动根外文件 → NOT_FOUND'
  )
  await assertDomain(
    () => moveFsEntry(svc, fs, ws.id, 'D:/库/../../秘密.txt', 'D:/库'),
    'NOT_FOUND',
    '④ .. 穿透移动（词汇解析后越界）→ NOT_FOUND'
  )
  await assertDomain(
    () => moveFsEntry(svc, fs, ws.id, 'D:/库/a.jpg', 'D:/库', '存在.jpg'),
    'CONFLICT',
    '④ 移动到已存在目标 → CONFLICT'
  )
  await assertDomain(
    () => moveFsEntry(svc, fs, ws.id, 'D:/库/sub', 'D:/库/sub/内层'),
    'INVALID',
    '④ 目录移入自身子树 → INVALID'
  )
  const moved = await moveFsEntry(svc, fs, ws.id, 'D:/库/a.jpg', 'D:/库/sub', '改名.jpg')
  assert(moved.to === 'D:/库/sub/改名.jpg', '④ 正常改名移动返回落位路径')
  assert((await fs.stat('D:/库/sub/改名.jpg')).exists && !(await fs.stat('D:/库/a.jpg')).exists, '④ 磁盘已迁移')

  await assertDomain(
    () => trashFsEntry(svc, fs, trash, ws.id, 'D:/库/不存在.jpg'),
    'NOT_FOUND',
    '④ 删除不存在路径 → NOT_FOUND'
  )
  await trashFsEntry(svc, fs, trash, ws.id, 'D:/库/存在.jpg')
  assert(trashPaths[0] === 'D:/库/存在.jpg', '④ 删除进回收站（记录路径）')

  // ── ⑤ 读宽松与查询边界 ──────────────────────────────────────────────
  assert((await browseWorkspace(svc, 'ws-不存在')).length === 0, '⑤ 未知工作区浏览 = 空')
  assert((await store.queryItems({ titleContains: '%' })).length === 0, '⑤ 通配符字符按字面匹配（无 LIKE 注入面）')
  assert((await store.queryItems({ sourceUriPrefix: '' })).length >= 0, '⑤ 空条件查询不抛错')

  console.log(`\nBOUNDARY CHECKS PASSED（断言执行 ${executedAsserts} 个）`)
}
