/**
 * 搜索词法断言（features/searchSyntax.ts）：`-标签` 排除、普通词元关键字、
 * 连字符文件名不误伤、末位悬置词元给候选。
 */

import { describe, expect, it } from 'vitest'
import { parseSearchInput } from '../features/searchSyntax'

/** 已声明标签名 → id（小写键，与 SearchBar 的映射同构）。 */
const NAMES = new Map<string, string>([
  ['风景', 'tag-scene'],
  ['旅行', 'tag-travel'],
  ['2023', 'tag-year'],
])

describe('搜索词法（-排除）', () => {
  it('`-标签名` 解析为排除 id，其余词元拼回关键字', () => {
    expect(parseSearchInput('日落 -旅行', NAMES)).toEqual({
      keyword: '日落',
      excludedTagIds: ['tag-travel'],
      pendingExclude: null,
    })
  })

  it('多个排除可叠加、重复词元去重；大小写不敏感（对拉丁名）', () => {
    const p = parseSearchInput('-旅行 -旅行 日落', NAMES)
    expect(p.excludedTagIds).toEqual(['tag-travel'])
    expect(p.keyword).toBe('日落')
  })

  it('`-x` 只有在 x 确实是标签时才成为排除——连字符文件名不误伤', () => {
    const p = parseSearchInput('photo-2023', NAMES)
    expect(p.keyword).toBe('photo-2023') // 无空白分隔：整体是一个词元，不以 - 开头
    const p2 = parseSearchInput('照片 -2024 落日', NAMES)
    expect(p2.keyword).toBe('照片 -2024 落日') // 中段未识别 → 仍是关键字
    expect(p2.excludedTagIds).toEqual([])
    expect(p2.pendingExclude).toBeNull()
    // 末位未识别 → 悬置给候选（可能是正在打一半的标签名）
    expect(parseSearchInput('照片 -2024', NAMES).pendingExclude).toBe('2024')
  })

  it('末位悬置的 `-前缀` 进 pendingExclude（候选按它过滤），不进关键字', () => {
    expect(parseSearchInput('日落 -旅', NAMES)).toEqual({
      keyword: '日落',
      excludedTagIds: [],
      pendingExclude: '旅',
    })
    expect(parseSearchInput('-旅', NAMES).pendingExclude).toBe('旅')
  })

  it('已在中间收起的排除不再悬置；空输入全空', () => {
    expect(parseSearchInput('-旅行 -旅', NAMES)).toEqual({
      keyword: '',
      excludedTagIds: ['tag-travel'],
      pendingExclude: '旅',
    })
    expect(parseSearchInput('', NAMES)).toEqual({ keyword: '', excludedTagIds: [], pendingExclude: null })
  })

  it('已知标签的排除与命中筛选可共存（组合语义归查询层，这里只管词法）', () => {
    const p = parseSearchInput('-风景 -旅行', NAMES)
    expect(p.excludedTagIds).toEqual(['tag-scene', 'tag-travel'])
  })
})
