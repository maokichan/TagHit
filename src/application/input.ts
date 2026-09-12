/**
 * 外部输入归一（应用层入口闸）。
 * 契约另一侧可能送来任意字符串——空白、超长、混合分隔符。名称类输入统一在此
 * trim + 空判 + 限长后返回规整值；越界 → INVALID（信封转译，不炸进程）。
 * 判定纪律：校验只在应用层入口做一次，存储层保持"实体写严格、关系写幂等"的既有语义。
 */

import { DomainError } from '../domain/index.ts'

export const NAME_MAX = 100

/** 名称类输入：trim 后非空、长度 ≤ NAME_MAX；返回规整值。 */
export function normalizeName(name: string, label: string): string {
  const n = name.trim()
  if (n.length === 0) throw new DomainError('INVALID', `${label}不能为空白`)
  if (n.length > NAME_MAX) throw new DomainError('INVALID', `${label}过长（超过 ${NAME_MAX} 字符）`)
  return n
}
