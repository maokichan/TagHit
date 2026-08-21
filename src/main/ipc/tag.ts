import { IPC } from '@shared/ipc'
import type {
  AddHierarchyRequest,
  CreateTagRequest,
  DeclareTagRequest,
  Tag,
  TagNode
} from '@shared/types/tag'
import type { AppContext } from '../services/context'
import { handle } from './util'

export function registerTagIpc(ctx: AppContext): void {
  handle<undefined, Tag[]>(IPC.tag.list, () => ctx.tagService.list())

  handle<undefined, TagNode[]>(IPC.tag.listWithRelations, () => ctx.tagService.listWithRelations())

  handle<{ workspaceId: number }, Tag[]>(IPC.tag.listForWorkspace, (args) =>
    ctx.tagService.listForWorkspace(args.workspaceId)
  )

  handle<CreateTagRequest, Tag>(IPC.tag.create, (args) => ctx.tagService.create(args))

  handle<{ id: number; name?: string; description?: string }, Tag>(IPC.tag.update, (args) =>
    ctx.tagService.update(args.id, { name: args.name, description: args.description })
  )

  handle<{ id: number }, void>(IPC.tag.remove, (args) => ctx.tagService.delete(args.id))

  handle<AddHierarchyRequest, void>(IPC.tag.addHierarchy, (args) =>
    ctx.tagService.addHierarchy(args)
  )

  handle<{ parentId: number; childId: number }, void>(IPC.tag.removeHierarchy, (args) =>
    ctx.tagService.removeHierarchy(args.parentId, args.childId)
  )

  handle<DeclareTagRequest, void>(IPC.tag.declare, (args) => ctx.tagService.declare(args))

  handle<DeclareTagRequest, void>(IPC.tag.undeclare, (args) => ctx.tagService.undeclare(args))
}
