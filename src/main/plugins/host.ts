import { app } from 'electron'
import { join } from 'path'
import type { PluginCallRequest, PluginInfo } from '@shared/types/plugin'
import { scanPluginDir, resolveEntry, loadPluginModule, type LoadedPlugin } from './registry'
import { createPluginContext, type PluginContext, type PluginExports } from './runtime'

interface RegisteredPlugin extends LoadedPlugin {
  exports?: PluginExports
  error?: string
}

/**
 * PluginHost —— 单一 Node 宿主托管全部插件（VSCode/Obsidian 式扩展架构）。
 * 主进程即 Node 运行时，插件以 JS 模块加载，Node API 按权限清单注入。
 * 这正是本重构的核心动机：不再需要 Rust 翻译层 + 独立 node sidecar。
 */
export class PluginHost {
  private plugins = new Map<string, RegisteredPlugin>()

  async load(): Promise<void> {
    // 内置（打包随 asarUnpack 分发）+ 用户安装（userData，同名覆盖）
    const bundled = scanPluginDir(join(app.getAppPath(), 'resources', 'plugins'))
    const user = scanPluginDir(join(app.getPath('userData'), 'plugins'))

    const all = new Map<string, LoadedPlugin>()
    for (const p of bundled) all.set(p.name, p)
    for (const p of user) all.set(p.name, p) // 用户版覆盖

    this.plugins.clear()
    for (const plugin of all.values()) {
      this.plugins.set(plugin.name, { ...plugin })
      this.activate(plugin)
    }
  }

  private activate(plugin: LoadedPlugin): void {
    try {
      const entryPath = resolveEntry(plugin.dir, plugin.manifest.entry)
      const module = loadPluginModule(entryPath) as {
        activate?: (ctx: PluginContext) => PluginExports | void
      }
      if (typeof module?.activate !== 'function') {
        throw new Error('插件未导出 activate(ctx)')
      }
      const ctx = createPluginContext(plugin.name, plugin.manifest)
      const exports = module.activate(ctx) ?? {}
      const reg = this.plugins.get(plugin.name) as RegisteredPlugin
      reg.exports = exports
      reg.error = undefined
    } catch (err) {
      const reg = this.plugins.get(plugin.name) as RegisteredPlugin
      reg.error = err instanceof Error ? err.message : String(err)
      console.error(`[plugin] ${plugin.name} 加载失败:`, reg.error)
    }
  }

  list(): PluginInfo[] {
    return [...this.plugins.values()].map((p) => ({
      name: p.name,
      version: p.manifest.version,
      description: p.manifest.description ?? null,
      entry: p.manifest.entry,
      loaded: !p.error,
      error: p.error,
      tools: Object.keys(p.exports?.tools ?? {})
    }))
  }

  async call(req: PluginCallRequest): Promise<unknown> {
    const plugin = this.plugins.get(req.plugin)
    if (!plugin) throw new Error(`插件「${req.plugin}」不存在`)
    if (plugin.error || !plugin.exports?.tools) throw new Error(`插件「${req.plugin}」未就绪`)
    const tool = plugin.exports.tools[req.tool]
    if (typeof tool !== 'function') throw new Error(`插件「${req.plugin}」没有工具「${req.tool}」`)
    return await tool(req.args)
  }
}
