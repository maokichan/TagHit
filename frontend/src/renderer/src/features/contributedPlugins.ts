/**
 * 三方插件装载与启停（dev 接线）。三方**发现/分发未接入**（目录扫描、安装待分发形态
 * 裁决）——本模块以硬编码清单模拟"已安装的插件"：每个插件 = 仓库根 `plugins/<dir>/`
 * 独立目录（磁盘 manifest.json + 入口模块），经 @plugins alias 装载。新增插件 =
 * 在 DEV_PLUGINS 加一个字面量条目（动态 import 必须字面量：vite/rollup 静态分析的前提）。
 *
 * **启动期激活是刻意的**：detailPreview 不挂任何停靠面，SurfaceHost 的惰性装载
 * （按挂载点渲染才 load）对纯预览贡献方永不触发——插件激活即注册其提供方，
 * 必须由本模块主动跑一次 loader。
 *
 * **启停（D43 修订）**：插件能力默认启用（安装即生效），但用户在插件面板可见、可停——
 * 停用 = 调激活清理函数（贡献摘除，内置预览自然兜底），启用 = 重新激活；启用态持久化
 * 于 config（`plugins:enabled:<featureId>`）。**插件永远不能悄悄接管：控制权在插件面板**。
 *
 * 失败边界：单个插件装载失败只 console 报告并跳过，不炸注册流程（registerContributedFeature
 * 的重复 id 拒绝同语义）。激活返回的清理函数存档于 disposers（启停/卸载的承载）。
 */

import { getFeature, registerContributedFeature, listContributedFeatures } from './registry'
import { createContributionContext, unregisterContributedCommands } from './contribution'
import type { PluginActivate } from './contribution'
import { useConfigStore } from '../stores/config'
import type { FeatureManifest } from '@shared/types/feature'

const config = useConfigStore()

interface DevPluginEntry {
  dir: string
  /** 磁盘 manifest = FeatureManifest 去掉 source（source 由 registerContributedFeature 打 contributed） */
  loadManifest: () => Promise<Omit<FeatureManifest, 'source'>>
  loadModule: () => Promise<{ activate: PluginActivate }>
}

const DEV_PLUGINS: DevPluginEntry[] = [
  {
    dir: 'audio-cover-player',
    // 磁盘 JSON 是边界：类型在此收窄（字段拼写/形状错误由 tsconfig.web 对 manifest 的
    // 引用面与运行时表现暴露；结构化校验随分发形态的 manifest 装载一并立）
    loadManifest: async () => (await import('@plugins/audio-cover-player/manifest.json')).default as Omit<FeatureManifest, 'source'>,
    loadModule: () => import('@plugins/audio-cover-player/src/index.ts')
  }
]

const disposers = new Map<string, () => void>()

/** 插件启用态（默认启用；持久化于 config，插件面板可改）。 */
export function isPluginEnabled(featureId: string): boolean {
  return config.value('plugins', `enabled:${featureId}`, true)
}

/** 已装载插件清单（manifest + 启用态），插件面板消费。 */
export function listInstalledPlugins(): Array<{ manifest: FeatureManifest; enabled: boolean }> {
  return listContributedFeatures().map((f) => ({ manifest: f.manifest, enabled: isPluginEnabled(f.manifest.id) }))
}

/** 启停开关：停用 = 调清理函数（贡献摘除）+ 按 owner 清扫命令（D46 兜底，停用不得残留）；启用 = 重新激活。 */
export async function setPluginEnabled(featureId: string, enabled: boolean): Promise<void> {
  config.setValue('plugins', `enabled:${featureId}`, enabled)
  disposers.get(featureId)?.()
  disposers.delete(featureId)
  unregisterContributedCommands(featureId)
  if (!enabled) return
  const entry = getFeature(featureId)
  if (entry?.impl.type === 'async') await entry.impl.load()
}

/** 装载并激活全部 dev 插件（main.ts 启动期调用；在内置预览注册之后，保证后注册覆盖先注册）。 */
export async function loadContributedPlugins(): Promise<void> {
  for (const plugin of DEV_PLUGINS) {
    try {
      const manifest = await plugin.loadManifest()
      // ctx 按插件独立创建（D46）：commands 槽的 id 前缀强制与 owner 记账以插件 id 为锚
      const ctx = createContributionContext(manifest.id)
      const registered = registerContributedFeature(manifest, async () => {
        const mod = await plugin.loadModule()
        const dispose = mod.activate(ctx)
        if (typeof dispose === 'function') disposers.set(manifest.id, dispose)
        // 无停靠/全页实现：贡献面只有 detailPreview（按条目认领，非挂载点渲染）
        return {}
      })
      if (!registered) continue // 重复 id：注册表已拒绝并报告
      if (!isPluginEnabled(manifest.id)) continue // 停用态：注册保底（面板可见），不激活
      const entry = getFeature(manifest.id)
      if (entry?.impl.type === 'async') await entry.impl.load()
    } catch (error) {
      console.error(`[plugins] 装载失败（已跳过）：${plugin.dir}`, error)
    }
  }
}
