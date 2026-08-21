import { app } from 'electron'
import { copyFileSync, mkdirSync } from 'fs'
import { join, normalize } from 'path'
import { IPC } from '@shared/ipc'
import type { AddPathRequest, ScanRequest, ScanResult, WorkspaceWithPaths } from '@shared/types/workspace'
import type { AppContext } from '../services/context'
import { handle } from './util'
import { workspaceDao, resolveCoverUri } from '../core/workspace/workspace.dao'
import { scanWorkspace } from '../core/workspace/scan'
import { AppEventBus } from '../events'

/** 工作区图片扩展名（封面自动选取用） */
function imageExts(ctx: AppContext): string[] {
  return Object.entries(ctx.config.get().fileFormatMap)
    .filter(([, v]) => v === 'image')
    .map(([k]) => k)
}

function withPaths(ctx: AppContext, id: number): WorkspaceWithPaths {
  const ws = workspaceDao.getById(ctx.db, id)
  if (!ws) throw new Error('工作区不存在')
  return {
    ...ws,
    paths: workspaceDao.listPaths(ctx.db, id),
    coverUri: resolveCoverUri(ctx.db, ws, imageExts(ctx))
  }
}

export function registerWorkspaceIpc(ctx: AppContext): void {
  handle<undefined, WorkspaceWithPaths[]>(IPC.workspace.list, () =>
    workspaceDao.list(ctx.db, imageExts(ctx))
  )

  handle<{ title: string }, WorkspaceWithPaths>(IPC.workspace.create, (args) => {
    const ws = workspaceDao.create(ctx.db, args.title.trim() || '未命名工作区')
    return { ...ws, paths: [], coverUri: null }
  })

  handle<{ id: number; title: string }, WorkspaceWithPaths>(IPC.workspace.update, (args) => {
    workspaceDao.update(ctx.db, args.id, args.title.trim() || '未命名工作区')
    return withPaths(ctx, args.id)
  })

  handle<{ id: number }, void>(IPC.workspace.remove, (args) => {
    workspaceDao.delete(ctx.db, args.id)
  })

  handle<AddPathRequest, WorkspaceWithPaths>(IPC.workspace.addPath, (args) => {
    if (!args.path.trim()) throw new Error('路径不能为空')
    workspaceDao.addPath(ctx.db, args.workspaceId, args.path.trim(), args.recursive ?? true)
    return withPaths(ctx, args.workspaceId)
  })

  handle<{ pathId: number; workspaceId: number }, WorkspaceWithPaths>(
    IPC.workspace.removePath,
    (args) => {
      // 移除路径的同时，把该路径下的条目从工作区脱离（保留全局条目/标签/元数据，不再标缺失）
      const row = ctx.db.read
        .prepare('SELECT path FROM workspace_path WHERE id = ? AND workspace_id = ?')
        .get(args.pathId, args.workspaceId) as { path: string } | undefined
      if (row) {
        workspaceDao.removePath(ctx.db, args.pathId)
        workspaceDao.detachItemsUnderPath(ctx.db, args.workspaceId, row.path)
      }
      return withPaths(ctx, args.workspaceId)
    }
  )

  handle<{ id: number; coverPath: string | null }, WorkspaceWithPaths>(
    IPC.workspace.setCover,
    (args) => {
      let cover = args.coverPath
      if (cover) {
        // 协议白名单 = 工作区路径 + userData；白名单外（如外部图片）复制进 userData/covers 再引用
        const allowed = [
          ...ctx.db.read
            .prepare('SELECT DISTINCT path FROM workspace_path')
            .all() as { path: string }[],
          { path: app.getPath('userData') }
        ].map((r) => normalize(r.path))
        const inWhitelist = allowed.some((root) => normalize(cover as string).toLowerCase().startsWith(root.toLowerCase()))
        if (!inWhitelist) {
          const dot = cover.lastIndexOf('.')
          const ext = dot >= 0 ? cover.slice(dot) : '.jpg'
          const dir = join(app.getPath('userData'), 'covers')
          mkdirSync(dir, { recursive: true })
          const target = join(dir, `ws-${args.id}${ext}`)
          copyFileSync(cover, target)
          cover = target
        }
      }
      workspaceDao.setCover(ctx.db, args.id, cover)
      return withPaths(ctx, args.id)
    }
  )

  // 扫描：异步分块执行，进度经事件总线推送到渲染进程
  handle<ScanRequest, ScanResult>(IPC.workspace.scan, async (args) => {
    const bus = AppEventBus.get()
    return scanWorkspace(ctx.db, ctx.config.get(), args.workspaceId, {
      incremental: args.incremental,
      onProgress: (p) => bus.broadcast(IPC.event.scanProgress, p)
    })
  })
}
