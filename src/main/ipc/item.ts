import { IPC } from '@shared/ipc'
import type { ItemFilter, ItemWithTags, UpdateTagsRequest } from '@shared/types/item'
import type { AppContext } from '../services/context'
import { handle } from './util'
import { itemDao } from '../core/item/item.dao'
import { tagDao } from '../core/tag/tag.dao'

export function registerItemIpc(ctx: AppContext): void {
  handle<ItemFilter, { items: ItemWithTags[]; total: number }>(IPC.item.list, (args) =>
    itemDao.list(ctx.db, args, ctx.config.get())
  )

  handle<{ id: number; workspaceId: number }, ItemWithTags | null>(IPC.item.get, (args) =>
    itemDao.getWithTags(ctx.db, args.id, args.workspaceId, ctx.config.get())
  )

  handle<UpdateTagsRequest, ItemWithTags | null>(IPC.item.updateTags, (args) => {
    // 挂载的标签必须是当前工作区已声明的（未声明 → 拒绝）
    for (const tagId of args.addTagIds) {
      if (!tagDao.isDeclared(ctx.db, args.workspaceId, tagId)) {
        throw new Error('该标签未在当前工作区声明，无法挂载')
      }
    }
    itemDao.updateTags(ctx.db, args.workspaceId, args.itemId, args.addTagIds, args.removeTagIds)
    return itemDao.getWithTags(ctx.db, args.itemId, args.workspaceId, ctx.config.get())
  })
}
