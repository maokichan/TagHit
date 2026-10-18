/**
 * 选择交互模型的断言（features/selection.ts + item store 的 setSelection）。
 *
 * 守两条：
 * ① **修饰键 → 意图**是壳级唯一实现：Shift 区间优先、Ctrl/Cmd 翻转、裸点击单选；
 *    带修饰键的点击不触发"打开"。
 * ② **框选结果的集合运算**在 item store：replace 整体替换、toggle 翻转命中（文件管理器
 *    手感：第二框撤误框）；"选中条目"始终落在多选集内，框空的语义两态分明。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useItemStore } from '../stores/item'
import { allowsOpen, marqueeIntentOf, selectIntentOf } from '../features/selection'
import type { ItemView } from '../lib/viewModel'

function mouse(mods: Partial<Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>> = {}): MouseEvent {
  return {
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
    shiftKey: mods.shiftKey ?? false,
    altKey: mods.altKey ?? false
  } as MouseEvent
}

describe('点击意图（壳级：修饰键 → 意图）', () => {
  it('裸点击 = 单选；Ctrl/Cmd = 出入多选集；Shift 优先于 Ctrl（一律按区间）', () => {
    expect(selectIntentOf(mouse())).toBe('replace')
    expect(selectIntentOf(mouse({ ctrlKey: true }))).toBe('toggle')
    expect(selectIntentOf(mouse({ metaKey: true }))).toBe('toggle')
    expect(selectIntentOf(mouse({ shiftKey: true }))).toBe('range')
    expect(selectIntentOf(mouse({ shiftKey: true, ctrlKey: true }))).toBe('range')
  })

  it('带任何修饰键的点击都不打开详情（选择手势不误触）', () => {
    expect(allowsOpen(mouse())).toBe(true)
    expect(allowsOpen(mouse({ ctrlKey: true }))).toBe(false)
    expect(allowsOpen(mouse({ shiftKey: true }))).toBe(false)
    expect(allowsOpen(mouse({ altKey: true }))).toBe(false)
  })

  it('框选意图：裸拖替换、Ctrl/Cmd+拖翻转（与点击同一套语义）', () => {
    expect(marqueeIntentOf(mouse())).toBe('replace')
    expect(marqueeIntentOf(mouse({ ctrlKey: true }))).toBe('toggle')
  })
})

/** 最小 ItemView 固件：集合运算只关心 id 与顺序。 */
let seq = 0
function mk(): ItemView {
  seq += 1
  return {
    id: `i${seq}`,
    kind: 'file',
    title: `item-${seq}`,
    status: 'active',
    sourceUri: null,
    contentHash: null,
    size: null,
    fileModifiedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    extension: null,
    mediaType: 'other',
    width: null,
    height: null,
    previewUri: null,
    tags: [],
    hiddenCount: 0
  }
}

describe('框选结果的集合运算（item store.setSelection）', () => {
  let store: ReturnType<typeof useItemStore>
  let a: ItemView, b: ItemView, c: ItemView, d: ItemView

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useItemStore()
    a = mk()
    b = mk()
    c = mk()
    d = mk()
    store.items = [a, b, c, d]
  })

  it('replace：整体替换为命中集（按视图顺序）', () => {
    store.setSelection([d.id, b.id], 'replace')
    expect(store.selectedIds).toEqual([b.id, d.id])
    expect(store.selected?.id).toBe(b.id)
  })

  it('replace 框空 = 清空选择（等于点空白）', () => {
    store.setSelection([a.id], 'replace')
    store.setSelection([], 'replace')
    expect(store.selectedIds).toEqual([])
    expect(store.selected).toBeNull()
  })

  it('toggle：命中未选中的翻进来，已选中的翻出去，未命中的不动', () => {
    store.setSelection([a.id], 'replace')
    store.setSelection([b.id, c.id], 'toggle')
    expect(store.selectedIds).toEqual([a.id, b.id, c.id])
    // 第二框撤误框：再翻转 b、c → 只剩 a
    store.setSelection([b.id, c.id], 'toggle')
    expect(store.selectedIds).toEqual([a.id])
  })

  it('toggle 后"选中条目"始终落在多选集内：被翻出去时落到首个翻进来的', () => {
    store.setSelection([a.id], 'replace')
    expect(store.selected?.id).toBe(a.id)
    // 翻转 a（原选中）与 b：a 出、b 进 → selected 落到 b，不能停在集合外
    store.setSelection([a.id, b.id], 'toggle')
    expect(store.selectedIds).toEqual([b.id])
    expect(store.selected?.id).toBe(b.id)
  })

  it('toggle 全部翻出去：多选集清空，"选中条目"不为集合外的条目', () => {
    store.setSelection([a.id, b.id], 'replace')
    store.setSelection([a.id, b.id], 'toggle')
    expect(store.selectedIds).toEqual([])
    expect(store.selected).toBeNull()
  })

  it('toggle 框空 = 无操作（保留既有选择）', () => {
    store.setSelection([a.id], 'replace')
    store.setSelection([], 'toggle')
    expect(store.selectedIds).toEqual([a.id])
    expect(store.selected?.id).toBe(a.id)
  })
})
