/**
 * 渲染层对宿主契约的 type-only 引用桥。
 *
 * 契约单一事实源在仓库根 `src/host/ipc.ts`（宿主侧），本文件只做类型再导出：
 * - frontend 的 tsconfig 通过 `@host/*` alias 指向根 src/host，仅 import type；
 * - 零运行时依赖：渲染层代码不得从 @host 导入任何可执行内容。
 * 渲染层所有契约/实体类型一律从本文件 import，不直接触 @host。
 */

export type {
  // 契约本体
  IpcContracts,
  IpcKind,
  IpcArgs,
  IpcResult,
  TaghitRendererApi,
  Ok,
  Err,
  Result,
  // 实体与查询形状
  Collection,
  Group,
  Id,
  Item,
  ItemHit,
  ItemsQuery,
  ItemStatus,
  NodeState,
  PathNode,
  ProjectedHit,
  ScanOptions,
  ScanSummary,
  Tag,
  WindowAction,
  Workspace,
  WorkspaceRoot
} from '@host/ipc'
