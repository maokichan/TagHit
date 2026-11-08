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
import type { LocalizedText } from '@shared/contract'
import type { DetailPreviewProvider } from './detailPreview'
import type { ItemView } from '../lib/viewModel'
import { resolveLocalized } from '../lib/localized'
import { i18n } from '../i18n'

/** detailPreview 槽的贡献注册面（provider id 约定 `<featureId>:<form>`，D37） */
export interface ContributionPreviews {
  register(provider: DetailPreviewProvider): void
  unregister(id: string): void
}

/**
 * commands 槽的贡献注册面（D46）：命令 id 强制 `<featureId>.` 前缀
 * （注册表 id 惯例 = 域.动作，插件的域就是它自己）；source 自动打 contributed，
 * 只进命令面板（右键菜单保持官方策展，D46）。title 允许语言映射（D51），
 * 注册时按当前语言解析为字符串快照——切语言后下次装载刷新。
 */
export interface ContributionCommands {
  register(manifest: Omit<CommandManifest, 'source' | 'title'> & { title: LocalizedText }, run: CommandHandler): void
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

/** owner 记账：插件 id → 其经 ctx 注册过的贡献 id（previews/commands 各一账；清扫与呈现的依据）。 */
const previewsByOwner = new Map<string, Set<string>>()
const commandsByOwner = new Map<string, Set<string>>()

function ownerSet(map: Map<string, Set<string>>, featureId: string): Set<string> {
  let set = map.get(featureId)
  if (set == null) {
    set = new Set()
    map.set(featureId, set)
  }
  return set
}

/**
 * 停用/卸载清扫（contributedPlugins 的 setPluginEnabled(false)/removePluginRuntime 调用）：
 * 摘除该插件经 ctx 注册的**全部贡献**（previews + commands）——插件自己的清理函数是
 * 第一道，这里是按 owner 的兜底，插件忘摘也不能残留（不能悄悄接管）。
 */
export function sweepContributions(featureId: string): void {
  for (const id of previewsByOwner.get(featureId) ?? []) unregisterDetailPreview(id)
  previewsByOwner.delete(featureId)
  for (const id of commandsByOwner.get(featureId) ?? []) unregisterCommand(id)
  commandsByOwner.delete(featureId)
}

/** 某插件当前经 ctx 注册的贡献 id 清单（管理页呈现用；停用清扫后即空——如实呈现）。 */
export function contributionsOf(featureId: string): { previews: string[]; commands: string[] } {
  return {
    previews: [...previewsByOwner.get(featureId) ?? []],
    commands: [...commandsByOwner.get(featureId) ?? []],
  }
}

export function createContributionContext(featureId: string): ContributionContext {
  return {
    hostApi,
    previews: {
      register(provider) {
        registerDetailPreview(provider)
        ownerSet(previewsByOwner, featureId).add(provider.id)
      },
      unregister(id) {
        unregisterDetailPreview(id)
        previewsByOwner.get(featureId)?.delete(id)
      }
    },
    commands: {
      register(manifest, run) {
        // 命名空间强制：contributed 命令的域 = 插件自己（防跨插件碰撞；官方域不受此限）
        if (!manifest.id.startsWith(`${featureId}.`)) {
          console.error(`[plugins] 命令 id 必须以「${featureId}.」开头，已拒绝：${manifest.id}`)
          return
        }
        // title 语言映射在注册时解析为快照（D51）：面板所见 = 装载那一刻的语言
        const title = resolveLocalized(manifest.title, i18n.global.locale.value)
        try {
          registerCommand({ ...manifest, title, source: 'contributed' }, run)
        } catch {
          // 重复 id = 重激活残留（模块缓存的旧命令未被清干净）：替换而非拒绝——
          // 重激活语义是"这家插件的这一版贡献生效"，卡死在旧账会让贡献面残缺
          try {
            unregisterCommand(manifest.id)
            registerCommand({ ...manifest, title, source: 'contributed' }, run)
          } catch (error) {
            console.error(`[plugins] 命令注册失败：${manifest.id}`, error)
            return
          }
        }
        ownerSet(commandsByOwner, featureId).add(manifest.id)
      },
      unregister(id) {
        unregisterCommand(id)
        commandsByOwner.get(featureId)?.delete(id)
      }
    }
  }
}

export type { DetailPreviewProvider, ItemView }
