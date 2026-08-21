import type { ParsedSearch } from '@shared/types/search'

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document'])
const SOURCE_TYPES = new Set(['bookmark', 'web_clip', 'note'])

/**
 * 搜索 DSL 解析器。语法：
 *   @tag1 @tag2            — 标签（AND 交集）
 *   type:image             — 媒体类别（image/video/audio/document）或来源类型
 *   >2024-01-01 <2024-12-31 — 日期范围（文件修改时间）
 *   workspace:1            — 指定工作区
 *   keyword                — 其余 token 作为文件名关键词（空格即 AND，用引号可包多词）
 */
export function parseSearchQuery(query: string): ParsedSearch {
  // 支持 "引号词组"：先提取，其余按空白切分
  const quoted: string[] = []
  const rest = query.replace(/"([^"]+)"/g, (_m, inner: string) => {
    quoted.push(inner)
    return ''
  })

  const tokens = rest.split(/\s+/).filter(Boolean).concat(quoted.length ? [`"${quoted.join(' ')}"`] : [])

  const result: ParsedSearch = {
    tags: [],
    types: [],
    dateFrom: null,
    dateTo: null,
    workspaceId: null,
    keyword: null
  }

  const keywordParts: string[] = []

  for (const raw of tokens) {
    const tok = raw.trim()
    if (!tok) continue

    if (tok.startsWith('@')) {
      result.tags.push(tok.slice(1))
    } else if (tok.startsWith('type:')) {
      const value = tok.slice(5).toLowerCase()
      if (MEDIA_TYPES.has(value) || SOURCE_TYPES.has(value)) result.types.push(value)
    } else if (tok.startsWith('>')) {
      result.dateFrom = tok.slice(1)
    } else if (tok.startsWith('<')) {
      result.dateTo = tok.slice(1)
    } else if (tok.startsWith('workspace:')) {
      const id = Number(tok.slice(10))
      if (Number.isInteger(id) && id > 0) result.workspaceId = id
    } else {
      keywordParts.push(tok.replace(/^"|"$/g, ''))
    }
  }

  result.keyword = keywordParts.length > 0 ? keywordParts.join(' ') : null
  return result
}
