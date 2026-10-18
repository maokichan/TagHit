/**
 * 搜索词法（壳级纯规则，D30 可测）：**搜索框是标签筛选的唯一书写处**——
 * 裸词元恰好是已声明标签名 = 必须含有；`-标签名` = 排除；其余词元 = 标题关键字。
 *
 * 语义基线（开发者拍板）：标签筛选默认即**必须含有**、与语义，`+` 不引入；`-` 前缀 = 排除；
 * 更多逻辑运算语法远期再加（见 TODO 主线「检索语法与建议」）。
 *
 * 解析只认**已声明标签名**——文件名里的连字符（`photo-2023`，或库里没有 "2023" 标签时的
 * `-2023`）按普通关键字处理，不误伤。没有候选弹层：词元留在栏里即筛选态，改字即改筛选。
 */

import type { Id } from '@shared/contract'

export interface ParsedSearch {
  /** 标题关键字（被识别为标签词元的不含在内；词元间以单空格相接）。 */
  keyword: string
  /** 必须含有的标签 id（裸词元命中声明集；按出现序去重）。 */
  requiredTagIds: Id[]
  /** 排除标签 id（`-名` 词元命中声明集；按出现序去重）。 */
  excludedTagIds: Id[]
}

export function parseSearchInput(raw: string, nameToId: ReadonlyMap<string, Id>): ParsedSearch {
  const tokens = raw.trim().split(/\s+/).filter((t) => t !== '')
  const keywordParts: string[] = []
  const requiredTagIds: Id[] = []
  const excludedTagIds: Id[] = []
  for (const tok of tokens) {
    if (tok.startsWith('-') && tok.length > 1) {
      const id = nameToId.get(tok.slice(1).toLowerCase())
      if (id != null) {
        if (!excludedTagIds.includes(id)) excludedTagIds.push(id)
        continue
      }
    } else {
      const id = nameToId.get(tok.toLowerCase())
      if (id != null) {
        if (!requiredTagIds.includes(id)) requiredTagIds.push(id)
        continue
      }
    }
    keywordParts.push(tok)
  }
  return { keyword: keywordParts.join(' '), requiredTagIds, excludedTagIds }
}
