/**
 * S3.2 校准脚本：内存 Store 上直跑首批六用例
 * （打标/卸标 · 浏览+声明投影 · 检索 · 作品/组维护 · 删除级联），逐项断言。
 *
 * 运行：node scripts/s32-calibrate.ts（node ≥ v24 直接剥类型执行 TS；无需构建）。
 * 这不是测试设施，只用于校准理解——断言失败即抛错中止。
 */

import { DomainError } from '../src/domain/index.ts'
import type { Collection, Group, Id, Tag } from '../src/domain/index.ts'
import { createMemoryStore } from '../src/adapters/memory/index.ts'
import {
  addGroupMember,
  appendCollectionMember,
  browseWorkspace,
  createCollection,
  createGroup,
  deleteCollectionCascade,
  deleteGroupCascade,
  deleteItemCascade,
  deleteTagCascade,
  deleteWorkspaceCascade,
  removeCollectionMember,
  removeGroupMember,
  renameCollection,
  renameGroup,
  reorderCollectionMembers,
  searchItems,
  searchTags,
  tagItem,
  untagItem,
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

function fileItem(id: Id, title: string, sourceUri: string) {
  return {
    kind: 'file' as const,
    id,
    title,
    sourceUri,
    contentHash: null,
    size: 12345,
    fileModifiedAt: T0,
    status: 'active' as const,
    createdAt: T0,
  }
}

async function main(): Promise<void> {
  const store = createMemoryStore()
  const svc: AppServices = { store, clock: { now: () => T0 }, idGen: makeIdGen() }

  // ---- 种子数据（直接经 Store；建库/扫描类用例不在首批范围） -------------
  await store.createWorkspace({ id: 'ws-main', name: '素材库', createdAt: T0 })
  await store.createWorkspace({ id: 'ws-collect', name: '收藏', createdAt: T0 })

  const tagIds = {
    scene: 'tag-scene', // 风景
    person: 'tag-person', // 人物
    night: 'tag-night', // 夜景
    red: 'tag-red', // 红色调
    collect: 'tag-collect', // 收藏级
  }
  const names: Record<string, string> = {
    [tagIds.scene]: '风景',
    [tagIds.person]: '人物',
    [tagIds.night]: '夜景',
    [tagIds.red]: '红色调',
    [tagIds.collect]: '收藏级',
  }
  for (const [id, name] of Object.entries(names)) {
    await store.createTag({ id, name, createdAt: T0 })
  }
  await store.linkTag(tagIds.scene, tagIds.red)

  const it = {
    sunset: 'item-sunset', // 海边日落.jpg
    night: 'item-night', // 城市夜景.png
    portrait: 'item-portrait', // 人物肖像.png
    doc: 'item-doc', // 论文.pdf
  }
  for (const item of [
    fileItem(it.sunset, '海边日落.jpg', 'C:/素材/photos/海边日落.jpg'),
    fileItem(it.night, '城市夜景.png', 'C:/素材/photos/城市夜景.png'),
    fileItem(it.portrait, '人物肖像.png', 'C:/素材/people/人物肖像.png'),
    fileItem(it.doc, '论文.pdf', 'C:/素材/docs/论文.pdf'),
  ]) {
    await store.createItem(item)
  }

  // ---- ① 打标 / 卸标 ------------------------------------------------------
  await tagItem(svc, it.sunset, [tagIds.scene, tagIds.red])
  await tagItem(svc, it.night, [tagIds.scene, tagIds.red])
  await tagItem(svc, it.portrait, [tagIds.person])
  await tagItem(svc, it.doc, [tagIds.collect])
  assertEqual(
    (await store.listAttachments({ tagId: tagIds.scene })).map((r) => r.itemId),
    [it.sunset, it.night], // 默认按插入序：日落先打标
    '打标：夜景与日落都已挂「风景」'
  )
  assertEqual(
    (await store.listAttachments({ tagId: tagIds.collect })).map((r) => r.itemId),
    [it.doc],
    '打标：论文挂「收藏级」'
  )

  await untagItem(svc, it.night, [tagIds.scene])
  const nightHit = (await store.queryItems({ ids: [it.night] }))[0]
  assertEqual(
    nightHit.tags.map((t) => t.id),
    [tagIds.red],
    '卸标：夜景卸下「风景」后仅剩「红色调」'
  )

  // 原子性：一个标签不存在 → 整组回滚，不留部分挂载
  let threw = false
  try {
    await tagItem(svc, it.sunset, [tagIds.person, 'tag-ghost'])
  } catch (error) {
    threw = error instanceof DomainError && error.code === 'NOT_FOUND'
  }
  assert(threw, '打标原子性：含不存在标签 → 抛 NOT_FOUND')
  const sunsetHit = (await store.queryItems({ ids: [it.sunset] }))[0]
  assertEqual(
    sunsetHit.tags.map((t) => t.id),
    [tagIds.red, tagIds.scene], // 按名升序：红色调 < 风景
    '打标原子性：回滚后日落未残留「人物」'
  )

  // ---- ② 浏览 + 声明投影 ----------------------------------------------------
  await store.declareTag('ws-main', tagIds.scene)
  await store.declareTag('ws-main', tagIds.person)
  await store.declareTag('ws-collect', tagIds.red)
  await store.declareTag('ws-collect', tagIds.collect)

  assertEqual(
    (await declaredTagIdsOf(svc, 'ws-main')).sort(),
    [tagIds.person, tagIds.scene],
    '投影依据：素材库声明了 风景/人物'
  )

  const wsMainView = await browseWorkspace(svc, 'ws-main')
  const sunsetView = wsMainView.find((h) => h.item.id === it.sunset)
  assert(!!sunsetView, '浏览：素材库视图中含日落')
  assertEqual(
    sunsetView!.tags.map((t) => t.name),
    ['风景'],
    '投影：日落交付标签 = 声明子集（红色调被隐藏）'
  )
  assertEqual(sunsetView!.hiddenCount, 1, '投影：日落隐藏 1 个未声明标签')
  const docView = wsMainView.find((h) => h.item.id === it.doc)
  assertEqual(docView!.hiddenCount, 1, '投影：论文标签全未声明 → 空交付 + 隐藏 1')

  const wsCollectRed = await browseWorkspace(svc, 'ws-collect', {
    withAnyTag: [tagIds.red],
  })
  assertEqual(
    wsCollectRed.map((h) => h.item.id),
    [it.night, it.sunset],
    '浏览：收藏工作区按「红色调」过滤到两张照片'
  )
  assert(
    wsCollectRed.every((h) => h.tags.some((t) => t.id === tagIds.red)),
    '浏览：交付的红色调来自声明集合'
  )

  // ---- ③ 检索 ------------------------------------------------------------
  assertEqual(
    (await searchItems(svc, { text: '日落' })).map((h) => h.item.id),
    [it.sunset],
    '检索：按文本「日落」'
  )
  assertEqual(
    (await searchItems(svc, { tagIds: [tagIds.scene] })).map((h) => h.item.id),
    [it.sunset],
    '检索：含「风景」标签（夜景已卸标）'
  )
  assertEqual(
    (await searchItems(svc, { tagIds: [tagIds.red, tagIds.scene], matchAllTags: true })).map(
      (h) => h.item.id
    ),
    [it.sunset],
    '检索：同时命中 红色调+风景 的仅日落'
  )
  assertEqual(
    (await searchTags(svc, '景')).map((t) => t.name),
    ['夜景', '风景'], // 按名升序（夜 U+591C < 风 U+98CE）
    '检索标签：按名子串「景」命中 夜景/风景'
  )

  // ---- ④ 作品维护 ----------------------------------------------------------
  const col = await createCollection(svc, '周末街拍')
  const colRow = await store.getCollection(col.id)
  assert(!!colRow, '作品：建库成功')
  const anchor = await store.getItem(colRow!.anchorItemId)
  assert(anchor?.kind === 'anchor', '作品：锚条目（空条目）随作品创建')
  const anchorId = (anchor as { id: Id }).id
  await tagItem(svc, anchorId, [tagIds.collect]) // 作品标签挂在锚上

  await appendCollectionMember(svc, col.id, it.sunset)
  await appendCollectionMember(svc, col.id, it.night)
  await appendCollectionMember(svc, col.id, it.doc)
  assertEqual(
    (await store.listCollectionMemberships({ collectionId: col.id })).map((m) => m.itemId),
    [it.sunset, it.night, it.doc],
    '作品：追加成员保持有序'
  )

  await reorderCollectionMembers(svc, col.id, [it.doc, it.sunset, it.night])
  assertEqual(
    (await store.listCollectionMemberships({ collectionId: col.id })).map((m) => ({
      id: m.itemId,
      pos: m.position,
    })),
    [
      { id: it.doc, pos: 0 },
      { id: it.sunset, pos: 1 },
      { id: it.night, pos: 2 },
    ],
    '作品：整体重排写入新位置'
  )
  await removeCollectionMember(svc, col.id, it.doc)
  assertEqual(
    (await store.listCollectionMemberships({ collectionId: col.id })).map((m) => m.itemId),
    [it.sunset, it.night],
    '作品：移除成员并压实位置'
  )
  await renameCollection(svc, col.id, '我的相册')
  assertEqual((await store.getCollection(col.id))!.name, '我的相册', '作品：改名')

  // ---- ⑤ 组维护 -----------------------------------------------------------
  const grp = await createGroup(svc, '色调')
  await addGroupMember(svc, grp.id, tagIds.red)
  await addGroupMember(svc, grp.id, tagIds.scene)
  assertEqual(
    (await store.listGroupMemberships({ groupId: grp.id })).map((m) => m.tagId),
    [tagIds.red, tagIds.scene],
    '组：加入成员'
  )
  await removeGroupMember(svc, grp.id, tagIds.red)
  await addGroupMember(svc, grp.id, tagIds.red) // 为后续级联恢复场景
  await renameGroup(svc, grp.id, '色彩分类')
  assertEqual((await store.getGroup(grp.id))!.name, '色彩分类', '组：改名')

  // ---- ⑥ 删除级联 ----------------------------------------------------------
  // 删除前 tag-scene 的挂靠：挂载(sunset)、关联(scene→red)、声明(ws-main)、组成员(grp)
  await deleteTagCascade(svc, tagIds.scene)
  assert((await store.getTag(tagIds.scene)) === null, '级联删标签：实体删除')
  assertEqual(
    (await store.listAttachments({ tagId: tagIds.scene })).length,
    0,
    '级联删标签：挂载清空'
  )
  assertEqual((await store.listTagLinks({ from: tagIds.scene })).length, 0, '级联删标签：出向关联清空')
  assertEqual(
    (await store.listDeclarations({ tagId: tagIds.scene })).length,
    0,
    '级联删标签：声明清空'
  )
  assertEqual(
    (await store.listGroupMemberships({ tagId: tagIds.scene })).length,
    0,
    '级联删标签：组成员行清空'
  )

  await deleteItemCascade(svc, it.doc)
  assert((await store.getItem(it.doc)) === null, '级联删条目：实体删除')
  assertEqual(
    (await store.listAttachments({ itemId: it.doc })).length,
    0,
    '级联删条目：挂载清空'
  )
  assertEqual(
    (await store.listCollectionMemberships({ itemId: it.doc })).length,
    0,
    '级联删条目：作品成员行清空'
  )

  await deleteCollectionCascade(svc, col.id)
  assert((await store.getCollection(col.id)) === null, '级联删作品：实体删除')
  assertEqual(
    (await store.listCollectionMemberships({ collectionId: col.id })).length,
    0,
    '级联删作品：成员行清空'
  )
  assert((await store.getItem(anchorId)) === null, '级联删作品：锚条目随作品删除')
  assertEqual(
    (await store.listAttachments({ tagId: tagIds.collect })).length,
    0,
    '级联删作品：锚的挂载（收藏级）清空'
  )

  await deleteGroupCascade(svc, grp.id)
  assert((await store.getGroup(grp.id)) === null, '级联删组：实体删除')
  assertEqual(
    (await store.listGroupMemberships({ groupId: grp.id })).length,
    0,
    '级联删组：成员行清空'
  )

  await deleteWorkspaceCascade(svc, 'ws-collect')
  assert((await store.getWorkspace('ws-collect')) === null, '级联删工作区：实体删除')
  assertEqual(
    (await store.listDeclarations({ workspaceId: 'ws-collect' })).length,
    0,
    '级联删工作区：声明清空'
  )

  // 残留完整性抽查
  assertEqual(
    (await store.queryTags({})).map((t: Tag) => t.id),
    [tagIds.person, tagIds.night, tagIds.collect, tagIds.red],
    '收尾：存活标签 = 人物/夜景/收藏级/红色调（按名升序）'
  )
  assertEqual(
    (await store.queryItems({})).map((h) => h.item.id),
    [it.night, it.portrait, it.sunset],
    '收尾：存活条目 = 夜景/人物肖像/日落'
  )

  console.log(`\nALL CHECKS PASSED（断言执行 ${executedAsserts} 个）`)
}

/** 声明集合读取（应用层 browse 内部同款逻辑）。 */
async function declaredTagIdsOf(svc: AppServices, workspaceId: Id): Promise<Id[]> {
  const rows = await svc.store.listDeclarations({ workspaceId })
  return rows.map((r) => r.tagId)
}

await main()
