import { app } from 'electron'
import { join } from 'path'
import { openDb, type AppDb } from '../db/connection'
import { ConfigService } from '../core/config'
import { TagService } from '../core/tag/tag.service'
import { SearchService } from '../core/search/search.service'
import { ThumbnailService } from '../core/thumbnail/thumbnail.service'
import { PluginHost } from '../plugins/host'

/** 主进程共享的依赖容器，供各 IPC 域使用 */
export interface AppContext {
  db: AppDb
  config: ConfigService
  tagService: TagService
  searchService: SearchService
  thumbnail: ThumbnailService
  pluginHost: PluginHost
}

export function createAppContext(): AppContext {
  const db = openDb(join(app.getPath('userData'), 'taghit.db'))
  const config = ConfigService.default()
  const tagService = new TagService(db, config)
  const searchService = new SearchService(db, config)
  const thumbnail = new ThumbnailService()
  const pluginHost = new PluginHost()
  return { db, config, tagService, searchService, thumbnail, pluginHost }
}
