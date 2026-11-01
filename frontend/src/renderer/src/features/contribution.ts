/**
 * 三方贡献契约（激活上下文）——插件 activate(ctx) 收到的唯一能力面。
 *
 * 与组件运行期 FeatureContext（features/context.ts，按挂载点注入）分名：本上下文
 * 属于**插件激活**时刻，注入的是"能贡献什么 + 能调什么"，不是呈现面现场。
 * 两条纪律：
 * - 三方代码只经本契约 + HostApi 取数与注册，不 import 渲染层内部模块
 *   （type-only 引用本模块的导出类型是唯一例外）；
 * - 贡献注册面按需增槽（首个真实消费方到货即加，不预建模）：
 *   previews（D37，音频播放器）、commands（D46，audioPlayer.revealPlaying）。
 *   views 槽曾在 D43 短暂落地、随"歌词归插件页"撤回——插件应把内容集中在
 *   一个页面里自组织（D43），多槽贡献等真实消费方再加。
 *
 * **ctx 按插件独立创建**（D46）：commands 槽的 id 前缀强制（`<featureId>.`）与
 * owner 记账都以插件 id 为锚——停用时按 owner 清扫，停用的插件不得残留命令
 * （"插件不能悄悄接管"纪律在调用面上的延伸）。
 */

import { hostApi } from './hostApi'
import { registerDetailPreview, unregisterDetailPreview } from './detailPreview'
import { registerCommand, unregisterCommand } from './commands'
import type { CommandHandler, CommandManifest } from '@shared/types/command'
import type { DetailPreviewProvider } from './detailPreview'
import type { ItemView } from '../lib/viewModel'

/** detailPreview 槽的贡献注册面（provider id 约定 `<featureId>:<form>`，D37） */
export interface ContributionPreviews {
  register(provider: DetailPreviewProvider): void
  unregister(id: string): void
}

/**
 * commands 槽的贡献注册面（D46）：命令 id 强制 `<featureId>.` 前缀
 * （注册表 id 惯例 = 域.动作，插件的域就是它自己）；source 自动打 contributed，
 * 只进命令面板（右键菜单保持官方策展，D46）。
 */
export interface ContributionCommands {
  register(manifest: Omit<CommandManifest, 'source'>, run: CommandHandler): void
  unregister(id: string): void
}

export interface ContributionContext {
  /** 数据与服务面（HostApi 冻结子集，独立版本号） */
  hostApi: typeof hostApi
  previews: ContributionPreviews
  commands: ContributionCommands
}

/** 插件模块激活钩子：返回清理函数则由装载方存档（启停/卸载的机制承载） */
export type PluginActivate = (ctx: ContributionContext) => void | (() => void)

/** owner 记账：插件 id → 其经 ctx 注册过的命令 id（清扫的依据；重复 register 幂等）。 */
const commandsByOwner = new Map<string, Set<string>>()

/**
 * 停用清扫（contributedPlugins 的 setPluginEnabled(false) 调用）：摘除该插件的
 * 全部命令——插件自己的清理函数是第一道（previews 同款惯例），这里是兜底，
 * 插件忘摘也不能残留（不能悄悄接管）。
 */
export function unregisterContributedCommands(featureId: string): void {
  const ids = commandsByOwner.get(featureId)
  if (ids == null) return
  for (const id of ids) unregisterCommand(id)
  commandsByOwner.delete(featureId)
}

export function createContributionContext(featureId: string): ContributionContext {
  const tracked = (): Set<string> => {
    let set = commandsByOwner.get(featureId)
    if (set == null) {
      set = new Set()
      commandsByOwner.set(featureId, set)
    }
    return set
  }
  return {
    hostApi,
    previews: {
      register: registerDetailPreview,
      unregister: unregisterDetailPreview
    },
    commands: {
      register(manifest, run) {
        // 命名空间强制：contributed 命令的域 = 插件自己（防跨插件碰撞；官方域不受此限）
        if (!manifest.id.startsWith(`${featureId}.`)) {
          console.error(`[plugins] 命令 id 必须以「${featureId}.」开头，已拒绝：${manifest.id}`)
          return
        }
        try {
          registerCommand({ ...manifest, source: 'contributed' }, run)
          tracked().add(manifest.id)
        } catch (error) {
          console.error(`[plugins] 命令注册被拒绝（重复 id）：${manifest.id}`, error)
        }
      },
      unregister(id) {
        unregisterCommand(id)
        commandsByOwner.get(featureId)?.delete(id)
      }
    }
  }
}

export type { DetailPreviewProvider, ItemView }
