import { app } from 'electron'
import { join } from 'path'
import { openDb, type AppDb } from '../db/connection'
import { ConfigService } from '../core/config'
import { TagService } from '../core/tag/tag.service'
import { ItemService } from '../core/item/item.service'
import { WorkspaceService } from '../core/workspace/workspace.service'
import { SearchService } from '../core/search/search.service'
import { ThumbnailService } from '../core/thumbnail/thumbnail.service'
import { PluginHost } from '../plugins/host'
import { AppEventBus, type EmitFn } from '../events'
import { IPC } from '@shared/ipc'
import { logger } from '../core/logger'

/**
 * 主进程共享的依赖容器，供各 IPC 域使用。
 * 官方 IPC handler 与（P1 起）插件桥共享同一批 service 实例——规则一致、事件同源。
 */
export interface AppContext {
  db: AppDb
  config: ConfigService
  tagService: TagService
  itemService: ItemService
  workspaceService: WorkspaceService
  searchService: SearchService
  thumbnail: ThumbnailService
  pluginHost: PluginHost
}

export function createAppContext(): AppContext {
  const db = openDb(join(app.getPath('userData'), 'taghit.db'))
  const config = ConfigService.default()
  const bus = AppEventBus.get()

  /**
   * service 事件回调（RFC §5.5 构造函数注入，显式依赖）。
   * P0.5：scan 进度/完成广播到渲染层（保持现状行为），其余领域事件记日志；
   * P1：同一回调串联 PluginHost.dispatchDomainEvent，插件订阅同一事件源。
   */
  const emit: EmitFn = (event, payload) => {
    if (event === 'scan:progress') {
      bus.broadcast(IPC.event.scanProgress, payload)
    } else if (event === 'scan:completed') {
      bus.broadcast(IPC.event.scanCompleted, payload)
    } else {
      logger.debug('domain', event, payload)
    }
  }

  const tagService = new TagService(db, config)
  const itemService = new ItemService(db, config, emit)
  const workspaceService = new WorkspaceService(db, config, emit)
  const searchService = new SearchService(db, itemService)
  const thumbnail = new ThumbnailService()
  const pluginHost = new PluginHost()
  return { db, config, tagService, itemService, workspaceService, searchService, thumbnail, pluginHost }
}
