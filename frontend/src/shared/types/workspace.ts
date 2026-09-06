export interface Workspace {
  id: number
  title: string
  createdAt: string
  updatedAt: string
  /** 用户指定封面路径；null = 自动取工作区内第一张图 */
  coverPath: string | null
}

export interface WorkspacePath {
  id: number
  workspaceId: number
  path: string
  recursive: boolean
}

export interface WorkspaceWithPaths extends Workspace {
  paths: WorkspacePath[]
  /** 封面展示地址：coverPath 优先，否则自动取工作区内一张图片（preview_uri → source_uri） */
  coverUri: string | null
}

export interface AddPathRequest {
  workspaceId: number
  path: string
  recursive?: boolean
}

export interface ScanProgress {
  workspaceId: number
  phase: 'walk' | 'hash' | 'finalize'
  processed: number
  total: number
  current: string | null
}

export interface ScanResult {
  filesAdded: number
  filesUpdated: number
  /** 目录仍在但文件缺失，被标记为 missing 的条目数 */
  filesMarkedMissing: number
  /** 已不在任何配置路径下 / 所在目录已消失，从工作区脱离的条目数 */
  filesDetached: number
  errors: number
  durationMs: number
}

export interface ScanRequest {
  workspaceId: number
  /** 渐进式：true 时仅处理新增/变更文件 */
  incremental?: boolean
}
