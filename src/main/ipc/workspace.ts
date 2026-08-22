import { IPC } from '@shared/ipc'
import type { AddPathRequest, ScanRequest, ScanResult, WorkspaceWithPaths } from '@shared/types/workspace'
import type { AppContext } from '../services/context'
import { handle } from './util'

/** 薄传输层：参数透传 + 错误透传；业务规则（封面策略/脱离语义/缺失判定）在 WorkspaceService */
export function registerWorkspaceIpc(ctx: AppContext): void {
  handle<undefined, WorkspaceWithPaths[]>(IPC.workspace.list, () => ctx.workspaceService.list())

  handle<{ title: string }, WorkspaceWithPaths>(IPC.workspace.create, (args) =>
    ctx.workspaceService.create(args.title)
  )

  handle<{ id: number; title: string }, WorkspaceWithPaths>(IPC.workspace.update, (args) =>
    ctx.workspaceService.update(args.id, args.title)
  )

  handle<{ id: number }, void>(IPC.workspace.remove, (args) => ctx.workspaceService.remove(args.id))

  handle<AddPathRequest, WorkspaceWithPaths>(IPC.workspace.addPath, (args) =>
    ctx.workspaceService.addPath(args)
  )

  handle<{ pathId: number; workspaceId: number }, WorkspaceWithPaths>(
    IPC.workspace.removePath,
    (args) => ctx.workspaceService.removePath(args.pathId, args.workspaceId)
  )

  handle<{ id: number; coverPath: string | null }, WorkspaceWithPaths>(
    IPC.workspace.setCover,
    (args) => ctx.workspaceService.setCover(args.id, args.coverPath)
  )

  // 扫描：异步分块执行，进度经领域事件（service emit → 事件总线）推送到渲染进程
  handle<ScanRequest, ScanResult>(IPC.workspace.scan, (args) => ctx.workspaceService.scan(args))
}
