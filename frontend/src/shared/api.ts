/**
 * 渲染层 API 门面：window.taghit（0.2 typed 窄桥）的薄封装。
 *
 * 职责只有两件：
 * 1. 解 Result 信封：ok 取 data；!ok 抛 ApiError（D9：按 code 转文案，message 原样附带）；
 * 2. 给 stores 一个稳定的调用面。类型全部来自 @shared/contract（type-only）。
 *
 * 不做的事：不做缓存、不做本地过滤排序（数据流裁决：改意图 → 窄桥调一次 → 失效重查）。
 */

import type {
  Id,
  ItemsQuery,
  ItemHit,
  ProjectedHit,
  Result,
  ScanOptions,
  ScanSummary,
  Tag,
  Workspace,
  WorkspaceRoot
} from './contract'

/** 窄桥错误：code 来自 DomainErrorCode | 'UNKNOWN'。 */
export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** D9 错误文案映射：code → 中文短句（message 作为细节附在其后）。 */
const ERROR_LABELS: Record<string, string> = {
  NOT_FOUND: '目标不存在',
  CONFLICT: '与现有数据冲突',
  INVALID: '输入不合法',
  UNKNOWN: '内部错误'
}

function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.data
  const label = ERROR_LABELS[result.error.code] ?? '内部错误'
  throw new ApiError(result.error.code, `${label}：${result.error.message}`)
}

function bridge(): NonNullable<Window['taghit']> {
  if (!window.taghit) {
    throw new ApiError('UNKNOWN', '宿主未就绪：请在 Electron 宿主内运行（window.taghit 不可用）')
  }
  return window.taghit
}

export const api = {
  tags: {
    async search(text: string): Promise<Tag[]> {
      return unwrap(await bridge().searchTags(text))
    },
    async create(input: { name: string; description?: string | null }): Promise<Tag> {
      return unwrap(await bridge().createTag(input))
    },
    async remove(tagId: Id): Promise<void> {
      unwrap(await bridge().deleteTag(tagId))
    },
    async declare(workspaceId: Id, tagId: Id): Promise<void> {
      unwrap(await bridge().declareTag({ workspaceId, tagId }))
    },
    async undeclare(workspaceId: Id, tagId: Id): Promise<void> {
      unwrap(await bridge().undeclareTag({ workspaceId, tagId }))
    }
  },
  items: {
    async query(query: ItemsQuery): Promise<ItemHit[]> {
      return unwrap(await bridge().queryItems(query))
    },
    async tag(itemId: Id, tagIds: Id[]): Promise<void> {
      unwrap(await bridge().tagItem({ itemId, tagIds }))
    },
    async untag(itemId: Id, tagIds: Id[]): Promise<void> {
      unwrap(await bridge().untagItem({ itemId, tagIds }))
    },
    async remove(itemId: Id): Promise<void> {
      unwrap(await bridge().deleteItem(itemId))
    }
  },
  workspaces: {
    async list(): Promise<Workspace[]> {
      return unwrap(await bridge().listWorkspaces())
    },
    async create(name: string): Promise<Workspace> {
      return unwrap(await bridge().createWorkspace(name))
    },
    async get(workspaceId: Id): Promise<Workspace | null> {
      return unwrap(await bridge().getWorkspace(workspaceId))
    },
    async remove(workspaceId: Id): Promise<void> {
      unwrap(await bridge().deleteWorkspace(workspaceId))
    },
    async browse(workspaceId: Id, query?: ItemsQuery): Promise<ProjectedHit[]> {
      return unwrap(await bridge().browseWorkspace(workspaceId, query))
    },
    async declaredTags(workspaceId: Id): Promise<Id[]> {
      return unwrap(await bridge().declaredTags(workspaceId))
    },
    async mountRoot(workspaceId: Id, path: string): Promise<void> {
      unwrap(await bridge().mountRoot({ workspaceId, path }))
    },
    async unmountRoot(workspaceId: Id, path: string): Promise<void> {
      unwrap(await bridge().unmountRoot({ workspaceId, path }))
    },
    async listRoots(workspaceId: Id): Promise<WorkspaceRoot[]> {
      return unwrap(await bridge().listRoots(workspaceId))
    },
    async scan(workspaceId: Id, options?: ScanOptions): Promise<ScanSummary> {
      return unwrap(await bridge().runScan(workspaceId, options))
    }
  }
}
