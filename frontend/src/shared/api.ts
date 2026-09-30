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
  BrowseResult,
  Id,
  ItemContext,
  ItemsQuery,
  ItemHit,
  ItemWindowResult,
  NodeState,
  PathNode,
  Result,
  RootManagementView,
  ScanOptions,
  ScanSummary,
  Tag,
  VisibilitySummary,
  WindowAction,
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

/**
 * 过桥前转成**纯数据**。
 *
 * 窄桥用结构化克隆传参，而 Pinia / `reactive` 里的值是 **Proxy**——克隆会直接抛
 * `DataCloneError: #<Object> could not be cloned.`，且 `{...store 对象}` 也不够
 * （嵌套数组仍是 Proxy）。所以凡是从 store 读回来的值，过桥前一律走这里。
 *
 * 教训（2026-10-01）：详情页的顺序上下文（从标签项读回）就是被这个坑整条打断的——请求
 * 全部失败，界面还把它显示成"非内容条目"，看起来像功能没做；批量打标弹层把 `ref` 数组
 * 直接过桥也是同一个病。**边界必须吃纯数据**，故在 bridge() 里统一转，而不是指望每个调用点记得。
 */
function plain<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

let cachedBridge: NonNullable<Window['taghit']> | null = null

/**
 * 宿主桥（渲染层唯一出口）。返回的是**入参已纯化**的包装：任何 `api.*` 调用都能安全地
 * 把 store 里的对象/数组当参数传进来（纯化原因见 `plain` 的注释）。
 *
 * **不能用 Proxy 包装它**（2026-10-01 实机踩到）：`contextBridge` 暴露的属性是
 * **只读且不可配置的数据属性**，而 Proxy 的 `get` 陷阱对这类属性必须返回原值——
 * 包一层函数会直接抛
 * `TypeError: 'get' on proxy: property 'listWorkspaces' is a read-only and non-configurable
 * data property on the proxy target but the proxy did not return its actual value`，
 * 结果是**所有调用全线失败**（界面表现：工作区列表空、详情页无序列）。
 * 正解是**拷成一个普通对象**、逐方法包一层。
 */
function bridge(): NonNullable<Window['taghit']> {
  if (!window.taghit) {
    throw new ApiError('UNKNOWN', '宿主未就绪：请在 Electron 宿主内运行（window.taghit 不可用）')
  }
  if (cachedBridge != null) return cachedBridge
  const raw = window.taghit as unknown as Record<string, unknown>
  const keys = Object.keys(raw)
  if (keys.length === 0) {
    // 理论上不会发生（contextBridge 的属性可枚举）；真发生就退回原桥，宁可少了纯化也不能全断
    console.warn('[api] window.taghit 无可枚举属性，跳过入参纯化包装')
    cachedBridge = window.taghit
    return cachedBridge
  }
  const wrapped: Record<string, unknown> = {}
  for (const key of keys) {
    const value = raw[key]
    wrapped[key] =
      typeof value === 'function'
        ? (...args: unknown[]) => (value as (...a: unknown[]) => unknown)(...args.map((a) => plain(a)))
        : value
  }
  cachedBridge = wrapped as unknown as NonNullable<Window['taghit']>
  return cachedBridge
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
    /** 顺序窗口（详情页翻页 + 前后预览）：context 由打开详情页那一刻固化（入参由 bridge 统一纯化）。 */
    async window(anchorId: Id, context: ItemContext): Promise<ItemWindowResult> {
      return unwrap(await bridge().itemWindow({ anchorId, context }))
    },
    async tag(itemId: Id, tagIds: Id[]): Promise<void> {
      unwrap(await bridge().tagItem({ itemId, tagIds }))
    },
    async untag(itemId: Id, tagIds: Id[]): Promise<void> {
      unwrap(await bridge().untagItem({ itemId, tagIds }))
    },
    async tagMany(itemIds: Id[], tagIds: Id[]): Promise<void> {
      unwrap(await bridge().tagItems({ itemIds, tagIds }))
    },
    async untagMany(itemIds: Id[], tagIds: Id[]): Promise<void> {
      unwrap(await bridge().untagItems({ itemIds, tagIds }))
    },
    async remove(itemId: Id): Promise<void> {
      unwrap(await bridge().deleteItem(itemId))
    },
    async readText(itemId: Id, maxBytes?: number): Promise<{ text: string; truncated: boolean } | null> {
      return unwrap(await bridge().readText(itemId, maxBytes))
    }
  },
  thumbnails: {
    /** 视频抓帧 JPEG base64 → 宿主落盘 + 按 contentHash 回写；返回缓存绝对路径。 */
    async save(input: {
      contentHash: string
      base64: string
      width?: number | null
      height?: number | null
    }): Promise<{ previewUri: string }> {
      return unwrap(await bridge().saveThumbnail(input))
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
    /** 浏览工作区：本页条目 + 成员总数（total 不受 limit/offset 影响；成员条件下沉在宿主侧）。 */
    async browse(workspaceId: Id, query?: ItemsQuery): Promise<BrowseResult> {
      return unwrap(await bridge().browseWorkspace(workspaceId, query))
    },
    async declaredTags(workspaceId: Id): Promise<Id[]> {
      return unwrap(await bridge().declaredTags(workspaceId))
    },
    /** 可见性摘要：可见 / 被排除隐藏 / 无节点归属（解释"为什么看不到全部内容"）。 */
    async visibility(workspaceId: Id): Promise<VisibilitySummary> {
      return unwrap(await bridge().workspaceVisibility(workspaceId))
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
    /** 来源根视图：退役根（卸载记录 + 条目数）+ 无记录脱根条目（按父目录聚合）。 */
    async rootManagement(workspaceId: Id): Promise<RootManagementView> {
      return unwrap(await bridge().workspaceRootManagement(workspaceId))
    },
    /** 清理脱根条目（不可恢复）：只删"当前不属于任何来源根"的条目，在根下的条目受保护。 */
    async cleanupDetached(input: { workspaceId: Id; dirPath?: string | null }): Promise<{ deleted: number }> {
      return unwrap(await bridge().cleanupDetachedItems(input))
    },
    async scan(workspaceId: Id, options?: ScanOptions): Promise<ScanSummary> {
      return unwrap(await bridge().runScan(workspaceId, options))
    }
  },
  window: {
    /** 壳级窗口控制（无边框窗口的自绘控制键）；发起方窗口由主进程按 sender 解析。 */
    async control(action: WindowAction): Promise<void> {
      unwrap(await bridge().windowControl(action))
    },
    async isMaximized(): Promise<boolean> {
      return unwrap(await bridge().isWindowMaximized())
    }
  },
  nodes: {
    /** 工作区全部路径节点（含来源根根节点；树形由路径前缀在渲染层派生）。 */
    async list(workspaceId: Id): Promise<PathNode[]> {
      return unwrap(await bridge().listNodes(workspaceId))
    },
    async setState(workspaceId: Id, dirPath: string, state: NodeState): Promise<void> {
      unwrap(await bridge().setNodeState({ workspaceId, dirPath, state }))
    },
    async setSubtreeState(workspaceId: Id, dirPath: string, state: NodeState): Promise<void> {
      unwrap(await bridge().setSubtreeState({ workspaceId, dirPath, state }))
    }
  },
  fs: {
    /** 真实文件改名/移动（路径闸门 = 来源根）；库随动由调用方重扫（contentHash 认领）收敛。 */
    async move(workspaceId: Id, from: string, toDir: string, newName?: string): Promise<{ to: string }> {
      return unwrap(await bridge().moveFsEntry({ workspaceId, from, toDir, newName: newName ?? null }))
    },
    /** 真实文件/目录移除（进系统回收站）。 */
    async trash(workspaceId: Id, path: string): Promise<void> {
      unwrap(await bridge().trashFsEntry({ workspaceId, path }))
    }
  },
  dialog: {
    /** 原生目录选择器；取消 → null。 */
    async pickDirectory(): Promise<string | null> {
      return unwrap(await bridge().pickDirectory())
    }
  }
}
