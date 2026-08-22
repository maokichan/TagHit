import { IPC } from '@shared/ipc'
import type { ItemFilter, ItemWithTags, UpdateTagsRequest } from '@shared/types/item'
import type { AppContext } from '../services/context'
import { handle } from './util'

/** 薄传输层：参数透传 + 错误透传，业务逻辑（声明校验/排序/格式映射）在 ItemService */
export function registerItemIpc(ctx: AppContext): void {
  handle<ItemFilter, { items: ItemWithTags[]; total: number }>(IPC.item.list, (args) =>
    ctx.itemService.list(args)
  )

  handle<{ id: number; workspaceId: number }, ItemWithTags | null>(IPC.item.get, (args) =>
    ctx.itemService.get(args.id, args.workspaceId)
  )

  handle<UpdateTagsRequest, ItemWithTags | null>(IPC.item.updateTags, (args) => {
    ctx.itemService.updateTags(args.workspaceId, args.itemId, args.addTagIds, args.removeTagIds)
    return ctx.itemService.get(args.itemId, args.workspaceId)
  })

  handle<{ itemId: number }, { text: string } | null>(IPC.item.readText, (args) =>
    ctx.itemService.readText(args.itemId)
  )

  handle<{ itemId: number }, void>(IPC.item.openWithSystem, (args) =>
    ctx.itemService.openWithSystem(args.itemId)
  )

  handle<undefined, Array<{ key: string; label: string }>>(IPC.item.listSortKeys, () =>
    ctx.itemService.listSortKeys()
  )
}
