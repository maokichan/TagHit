/**
 * 外部输入归一（应用层入口闸）。
 * 契约另一侧可能送来任意字符串——空白、超长、混合分隔符。名称类输入统一在此
 * trim + 空判 + 限长后返回规整值；越界 → INVALID（信封转译，不炸进程）。
 * 判定纪律：归一（trim/空判/限长）只在应用层入口做一次；端口契约自身的实体写语义
 * （严格：空名/重名/缺实体 → NOT_FOUND/CONFLICT/INVALID）由适配器按契约兜底——
 * 入口归一与契约防御各司其职（端口是公共边界，校准与未来入口直调它），不互相替代。
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
