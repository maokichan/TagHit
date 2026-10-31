/**
 * 三方贡献契约（激活上下文）——插件 activate(ctx) 收到的唯一能力面。
 *
 * 与组件运行期 FeatureContext（features/context.ts，按挂载点注入）分名：本上下文
 * 属于**插件激活**时刻，注入的是"能贡献什么 + 能调什么"，不是呈现面现场。
 * 两条纪律：
 * - 三方代码只经本契约 + HostApi 取数与注册，不 import 渲染层内部模块
 *   （type-only 引用本模块的导出类型是唯一例外）；
 * - 贡献注册面按需增槽（v0 只有 detailPreview——首个真实消费方即音频播放器插件；
 *   命令/视图槽接各自的首个消费方再加，不预建模）。
 */

import { hostApi } from './hostApi'
import { registerDetailPreview, unregisterDetailPreview } from './detailPreview'
import type { DetailPreviewProvider } from './detailPreview'
import type { ItemView } from '../lib/viewModel'

/** detailPreview 槽的贡献注册面（provider id 约定 `<featureId>:<form>`，D37） */
export interface ContributionPreviews {
  register(provider: DetailPreviewProvider): void
  unregister(id: string): void
}

export interface ContributionContext {
  /** 数据与服务面（HostApi 冻结子集，独立版本号） */
  hostApi: typeof hostApi
  previews: ContributionPreviews
}

/** 插件模块激活钩子：返回清理函数则由装载方存档（启停/卸载的机制承载） */
export type PluginActivate = (ctx: ContributionContext) => void | (() => void)

export function createContributionContext(): ContributionContext {
  return {
    hostApi,
    previews: {
      register: registerDetailPreview,
      unregister: unregisterDetailPreview
    }
  }
}

export type { DetailPreviewProvider, ItemView }
