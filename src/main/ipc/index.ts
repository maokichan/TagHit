import type { AppContext } from '../services/context'
import { registerWorkspaceIpc } from './workspace'
import { registerTagIpc } from './tag'
import { registerItemIpc } from './item'
import { registerSearchIpc } from './search'
import { registerConfigIpc } from './config'
import { registerPluginIpc } from './plugin'
import { registerDialogIpc } from './dialog'
import { registerThumbnailIpc } from './thumbnail'

/** 一次性注册全部 IPC 域 */
export function registerAllIpc(ctx: AppContext): void {
  registerWorkspaceIpc(ctx)
  registerTagIpc(ctx)
  registerItemIpc(ctx)
  registerSearchIpc(ctx)
  registerConfigIpc(ctx)
  registerPluginIpc(ctx)
  registerDialogIpc()
  registerThumbnailIpc(ctx)
}
