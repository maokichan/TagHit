import { IPC } from '@shared/ipc'
import type { SearchRequest, SearchResult } from '@shared/types/search'
import type { AppContext } from '../services/context'
import { handle } from './util'

export function registerSearchIpc(ctx: AppContext): void {
  handle<SearchRequest, SearchResult>(IPC.search.query, (args) => ctx.searchService.query(args))

  handle<SearchRequest, SearchResult>(IPC.search.global, (args) =>
    ctx.searchService.globalQuery(args)
  )
}
