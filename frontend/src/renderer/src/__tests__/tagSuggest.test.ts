/**
 * 打标建议相关性排序的断言（lib/tagSuggest）：共现强者在前、无共现退回名单序、
 * 过滤（未挂载 + 关键字）与排序解耦。
 */

import { describe, expect, it } from 'vitest'
import { suggestTags } from '../lib/tagSuggest'

const CANDIDATES = [
  { id: 't-a', name: '风景' },
  { id: 't-b', name: '海滩' },
  { id: 't-c', name: '人物' },
  { id: 't-d', name: '夜景' },
]

/** 共现表：海滩↔风景 9 次，人物↔风景 2 次，其余 0。 */
const PAIRS = new Map<string, number>([
  ['t-a|t-b', 9],
  ['t-a|t-c', 2],
])
const together = (a: string, b: string): number => {
  if (a === b) return 0
  const key = a < b ? `${a}|${b}` : `${b}|${a}`
  return PAIRS.get(key) ?? 0
}

describe('打标建议排序（按共现相关性）', () => {
  it('与已挂标签共现强的候选排前：条目已挂"风景"时，海滩(9) > 人物(2) > 其余按名单序', () => {
    const out = suggestTags({
      candidates: CANDIDATES,
      assignedIds: ['t-a'],
      query: '',
      together,
    })
    expect(out.map((t) => t.id)).toEqual(['t-b', 't-c', 't-d'])
  })

  it('多参照系求和：已挂 风景+人物 时，海滩 = 与风景 9 + 与人物 0，仍居首', () => {
    const out = suggestTags({
      candidates: CANDIDATES,
      assignedIds: ['t-a', 't-c'],
      query: '',
      together,
    })
    expect(out.map((t) => t.id)).toEqual(['t-b', 't-d'])
  })

  it('条目无标签（无参照系）→ 名单原名序（后端按名升序 = 码点序），不假装相关', () => {
    const out = suggestTags({
      candidates: CANDIDATES,
      assignedIds: [],
      query: '',
      together,
    })
    // 风(98CE) > 海(6D77) > 夜(591C) > 人(4EBA)：码点序即后端名单序
    expect(out.map((t) => t.id)).toEqual(['t-c', 't-d', 't-b', 't-a'])
  })

  it('过滤与排序解耦：已挂载的不出现，关键字按名包含匹配', () => {
    const out = suggestTags({
      candidates: CANDIDATES,
      assignedIds: ['t-b'],
      query: '海',
      together,
    })
    expect(out.map((t) => t.id)).toEqual([]) // 海滩已挂载，唯一含"海"的候选被滤掉
    const out2 = suggestTags({
      candidates: CANDIDATES,
      assignedIds: ['t-a'],
      query: '夜',
      together,
    })
    expect(out2.map((t) => t.id)).toEqual(['t-d'])
  })

  it('limit 截断取排序后的前 N', () => {
    const out = suggestTags({
      candidates: CANDIDATES,
      assignedIds: ['t-a'],
      query: '',
      together,
      limit: 2,
    })
    expect(out.map((t) => t.id)).toEqual(['t-b', 't-c'])
  })
})
