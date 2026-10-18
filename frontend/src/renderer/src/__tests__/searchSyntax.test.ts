/**
 * 搜索词法断言（features/searchSyntax.ts）：裸标签词元 = 必须含有、`-标签` = 排除、
 * 其余 = 标题关键字；连字符文件名不误伤；词元即筛选态（没有候选弹层的概念）。
 */

import { describe, expect, it } from 'vitest'
import { parseSearchInput } from '../features/searchSyntax'

/** 已声明标签名 → id（小写键，与 SearchBar 的映射同构）。 */
const NAMES = new Map<string, string>([
  ['风景', 'tag-scene'],
  ['旅行', 'tag-travel'],
  ['2023', 'tag-year'],
])

describe('搜索词法（词元即筛选）', () => {
  it('裸标签词元 = 必须含有；`-标签名` = 排除；其余词元拼回关键字', () => {
    expect(parseSearchInput('日落 风景 -旅行', NAMES)).toEqual({
      keyword: '日落',
      requiredTagIds: ['tag-scene'],
      excludedTagIds: ['tag-travel'],
    })
  })

  it('多个标签词元可叠加（与语义）、重复去重', () => {
    const p = parseSearchInput('风景 旅行 风景', NAMES)
    expect(p.requiredTagIds).toEqual(['tag-scene', 'tag-travel'])
    expect(p.keyword).toBe('')
  })

  it('`-x` 只有在 x 确实是标签时才成为排除——连字符文件名不误伤', () => {
    const p = parseSearchInput('photo-2023', NAMES)
    expect(p.keyword).toBe('photo-2023') // 无空白分隔：整体是一个词元，不以 - 开头
    const p2 = parseSearchInput('照片 -2024 落日', NAMES)
    expect(p2.keyword).toBe('照片 -2024 落日') // 未识别的 -词元 → 仍是关键字（不打哑炮）
    expect(p2.requiredTagIds).toEqual([])
    expect(p2.excludedTagIds).toEqual([])
  })

  it('已知标签名的关键字形式也让位给标签语义（同名词元即筛选）', () => {
    // 输入恰好是标签名 → 是筛选，不是标题关键字（标题搜同名词走其他词元组合）
    expect(parseSearchInput('风景', NAMES)).toEqual({
      keyword: '',
      requiredTagIds: ['tag-scene'],
      excludedTagIds: [],
    })
  })

  it('空输入全空', () => {
    expect(parseSearchInput('', NAMES)).toEqual({ keyword: '', requiredTagIds: [], excludedTagIds: [] })
  })
})
