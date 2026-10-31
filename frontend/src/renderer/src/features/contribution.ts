/**
 * 三方贡献契约（激活上下文）——插件 activate(ctx) 收到的唯一能力面。
 *
 * 与组件运行期 FeatureContext（features/context.ts，按挂载点注入）分名：本上下文
 * 属于**插件激活**时刻，注入的是"能贡献什么 + 能调什么"，不是呈现面现场。
 * 两条纪律：
 * - 三方代码只经本契约 + HostApi 取数与注册，不 import 渲染层内部模块
 *   （type-only 引用本模块的导出类型是唯一例外）；
 * - 贡献注册面按需增槽（首个真实消费方即到货即加，不预建模）：
 *   previews（D37，音频播放器）· views（D43，歌词视图）。
 */

import { hostApi } from './hostApi'
import { registerDetailPreview, unregisterDetailPreview } from './detailPreview'
import { registerDetailView, unregisterDetailView } from './detailWorkbench/views'
import { useDetailWorkbenchContext } from './detailWorkbench/context'
import type { DetailPreviewProvider } from './detailPreview'
import type { DetailViewEntry } from './detailWorkbench/views'
import type { ItemView } from '../lib/viewModel'

/** detailPreview 槽的贡献注册面（provider id 约定 `<featureId>:<form>`，D37） */
export interface ContributionPreviews {
  register(provider: DetailPreviewProvider): void
  unregister(id: string): void
}

/** detailView 槽的贡献注册面（视图 id 约定 `<featureId>:<name>`，D39/D43） */
export interface ContributionViews {
  register(view: DetailViewEntry): void
  unregister(id: string): void
}

export interface ContributionContext {
  /** 数据与服务面（HostApi 冻结子集，独立版本号） */
  hostApi: typeof hostApi
  previews: ContributionPreviews
  views: ContributionViews
}

/** 插件模块激活钩子：返回清理函数则由装载方存档（启停/卸载的机制承载） */
export type PluginActivate = (ctx: ContributionContext) => void | (() => void)

export function createContributionContext(): ContributionContext {
  return {
    hostApi,
    previews: {
      register: registerDetailPreview,
      unregister: unregisterDetailPreview
    },
    views: {
      register: registerDetailView,
      unregister: unregisterDetailView
    }
  }
}

export type { DetailPreviewProvider, DetailViewEntry, ItemView }

/**
 * detailView 视图取条目上下文的唯一合法通道（re-export，D43）：
 * 视图组件无 props、数据全靠工作台注入——插件视图经契约模块拿到它，
 * 不接触壳内部模块（同构 hostApi re-export api 的冻结面模式）。
 */
export { useDetailWorkbenchContext }
