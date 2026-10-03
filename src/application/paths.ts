/**
 * 路径小工具（应用层对外出口）。
 *
 * 路径规则的实现已上移**领域层** `src/domain/paths.ts`：路径规则是跨层共用的纯规则——
 * 存储适配器翻译「可见性派生」查询条件时必须与它同解（SQL 译文逐一致由校准 s35 保证），
 * 两份独立实现必然漂移。此处仅再导出，保持应用层既有 import 面与 `application/index` 出口不变。
 *
 * 另承载应用层共用的**来源根闸门**：`assertUnderRoot` 原先在 fileOps.ts 与 nodes.ts
 * 各写一份（连错误文案都一样，D28 单一来源纪律的同款病），收口到此单实现。
 */

import { DomainError } from '../domain/index.ts'
import type { Id } from '../domain/index.ts'
import { isUnderRoot, normalizePath } from '../domain/paths.ts'
import type { AppServices } from './services.ts'

export { basename, isUnderDir, isUnderRoot, joinPath, normalizePath, parentDir } from '../domain/paths.ts'

/**
 * 断言 path 位于工作区某来源根之下（路径段匹配，D15/D18 同规则）；越界 → NOT_FOUND。
 * 返回归一化后的路径——调用方直接使用，不必再 normalize 一次（混合分隔符不得产生双身份）。
 */
export async function assertUnderRoot(
  svc: AppServices,
  workspaceId: Id,
  path: string
): Promise<string> {
  const roots = await svc.store.listWorkspaceRoots(workspaceId)
  const p = normalizePath(path)
  if (!isUnderRoot(roots.map((r) => r.path), p)) {
    throw new DomainError('NOT_FOUND', `路径不在工作区来源根之下（${p}）`)
  }
  return p
}
