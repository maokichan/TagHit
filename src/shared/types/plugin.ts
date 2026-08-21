/** 插件清单（manifest），VSCode/Obsidian 式扩展宿主 */
export interface PluginManifest {
  name: string
  version: string
  description?: string
  /** 相对插件目录的入口文件（CJS/ESM） */
  entry: string
  /** 声明式权限 */
  permissions?: {
    /** 允许访问 Node 文件系统 API */
    fs?: boolean
    /** 允许发起网络请求 */
    network?: boolean
    /** 允许执行子进程 */
    shell?: boolean
  }
}

export interface PluginInfo {
  name: string
  version: string
  description: string | null
  entry: string
  loaded: boolean
  error?: string
  /** 插件暴露的工具名列表 */
  tools: string[]
}

export interface PluginCallRequest {
  plugin: string
  tool: string
  args?: unknown
}
