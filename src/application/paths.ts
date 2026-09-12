/**
 * 路径小工具（应用层对外出口）。
 *
 * 实现已上移**领域层** `src/domain/paths.ts`：路径规则是跨层共用的纯规则——
 * 存储适配器翻译「可见性派生」查询条件时必须与它同解（SQL 译文逐一致由校准 s35 保证），
 * 两份独立实现必然漂移。此处仅再导出，保持应用层既有 import 面与 `application/index` 出口不变。
 */

export { basename, isUnderDir, isUnderRoot, joinPath, normalizePath, parentDir } from '../domain/paths.ts'
