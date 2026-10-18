/**
 * 搜索词法（壳级纯规则，D30 可测）：`-标签名` = 排除，其余词元 = 标题关键字。
 *
 * 语义基线（开发者拍板）：标签筛选默认即**必须含有**、与语义，`+` 不引入；`-` 前缀 = 排除；
 * 更多逻辑运算语法远期再加（见 TODO 主线「检索语法与建议」）。
 *
 * 解析只认**已声明标签名**——`-x` 只有在 x 确实是标签时才成为排除；文件名里的连字符
 * （`photo-2023`，或库里没有 "2023" 标签时的 `-2023`）按普通关键字处理，不误伤。
 */

import type { Id } from '@shared/contract'

export interface ParsedSearch {
  /** 标题关键字（被识别为排除的词元与末位悬置词元不含在内；词元间以单空格相接）。 */
  keyword: string
  /** 排除标签 id（词元 `-名` 依声明集解析；按出现序去重）。 */
  excludedTagIds: Id[]
  /**
   * 末位悬而未决的 `-前缀`（还没匹配到完整标签名）：候选列表按它过滤、点选即收起为排除。
   * 只在**最后一个**词元上悬置——中间的未识别 `-x` 仍是关键字（往回改字是常态）。
   */
  pendingExclude: string | null
}

export function parseSearchInput(raw: string, nameToId: ReadonlyMap<string, Id>): ParsedSearch {
  const tokens = raw.trim().split(/\s+/).filter((t) => t !== '')
  const keywordParts: string[] = []
  const excludedTagIds: Id[] = []
  let pendingExclude: string | null = null
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!
    if (tok.startsWith('-') && tok.length > 1) {
      const id = nameToId.get(tok.slice(1).toLowerCase())
      if (id != null) {
        if (!excludedTagIds.includes(id)) excludedTagIds.push(id)
        continue
      }
      if (i === tokens.length - 1) {
        pendingExclude = tok.slice(1)
        continue
      }
    }
    keywordParts.push(tok)
  }
  return { keyword: keywordParts.join(' '), excludedTagIds, pendingExclude }
}
