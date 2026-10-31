/**
 * 三方插件装载（dev 接线）。三方**发现/分发未接入**（目录扫描、安装、启停管理
 * 待分发形态裁决）——本模块以硬编码清单模拟"已安装的插件"：每个插件 = 仓库根
 * `plugins/<dir>/` 独立目录（磁盘 manifest.json + 入口模块），经 @plugins alias 装载。
 * 新增插件 = 在 DEV_PLUGINS 加一个字面量条目（动态 import 必须字面量：vite/rollup
 * 静态分析的前提，构建产物才可达）。
 *
 * **启动期激活是刻意的**：detailPreview 不挂任何停靠面，SurfaceHost 的惰性装载
 * （按挂载点渲染才 load）对纯预览贡献方永不触发——插件激活即注册其提供方，
 * 必须由本模块主动跑一次 loader。惰性激活条件机制归分发里程碑，不预建模。
 *
 * 失败边界：单个插件装载失败只 console 报告并跳过，不炸注册流程（registerContributedFeature
 * 的重复 id 拒绝同语义）。激活返回的清理函数存档于 disposers（三方启停/卸载的承载，v0 无 UI 消费）。
 */

import { getFeature, registerContributedFeature } from './registry'
import { createContributionContext } from './contribution'
import type { PluginActivate } from './contribution'
import type { FeatureManifest } from '@shared/types/feature'

interface DevPluginEntry {
  dir: string
  /** 磁盘 manifest = FeatureManifest 去掉 source（source 由 registerContributedFeature 打 contributed） */
  loadManifest: () => Promise<Omit<FeatureManifest, 'source'>>
  loadModule: () => Promise<{ activate: PluginActivate }>
}

const DEV_PLUGINS: DevPluginEntry[] = [
  {
    dir: 'audio-cover-player',
    loadManifest: async () => (await import('@plugins/audio-cover-player/manifest.json')).default,
    loadModule: () => import('@plugins/audio-cover-player/src/index.ts')
  }
]

const disposers = new Map<string, () => void>()

/** 装载并激活全部 dev 插件（main.ts 启动期调用；在内置预览注册之后，保证后注册覆盖先注册）。 */
export async function loadContributedPlugins(): Promise<void> {
  const ctx = createContributionContext()
  for (const plugin of DEV_PLUGINS) {
    try {
      const manifest = await plugin.loadManifest()
      const registered = registerContributedFeature(manifest, async () => {
        const mod = await plugin.loadModule()
        const dispose = mod.activate(ctx)
        if (typeof dispose === 'function') disposers.set(manifest.id, dispose)
        // 无停靠/全页实现：贡献面只有 detailPreview（按条目认领，非挂载点渲染）
        return {}
      })
      if (!registered) continue // 重复 id：注册表已拒绝并报告
      const entry = getFeature(manifest.id)
      if (entry?.impl.type === 'async') await entry.impl.load()
    } catch (error) {
      console.error(`[plugins] 装载失败（已跳过）：${plugin.dir}`, error)
    }
  }
}
