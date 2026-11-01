/**
 * 详细页预览贡献点（detailPreview 槽，第五类槽——与停靠/面板类槽正交：
 * 它按**条目**认领而非按挂载点常驻）。
 *
 * 机制（DECISIONS D37）：详情页预览区是一个槽——内置图片/视频/音频/文本四类预览是
 * **默认提供方**（启动期经同一条注册表注册，source 上仍是 official），功能组件可注册
 * 自己的提供方**按媒体形态/扩展名认领**渲染（如音频播放器认领音频、pdf 阅读器认领 pdf）。
 * 裁决三条：
 * ① **认领制**：provider 用 claims(item) 声明"这个条目归我"，壳（详情页）不认识任何
 *    具体格式——加一种可预览格式不需要改详情页；
 * ② **后注册覆盖先注册**：内置先注册、三方后注册（动态装载天然更晚）→ 三方对同类条目
 *    的认领自然替换内置默认（音频插件替换内置 <audio> 就是第一个消费方）；
 * ③ **自持状态**：加载、失败兜底、缩放平移等渲染内状态归 provider 自治——详情页只管
 *    "谁来渲染"，不管"怎么渲染"（顺序窗口/翻页/预览条仍是详情页的职责）。
 */

import type { Component } from 'vue'
import type { ItemView } from '../lib/viewModel'

export interface DetailPreviewProvider {
  /** 全局唯一 id（内置 `builtin:<form>`；三方用 `<featureId>:<form>` 前缀）。 */
  id: string
  /** 认领判定：这个条目归我渲染（纯谓词，不得有副作用）。 */
  claims(item: ItemView): boolean
  /** 渲染实现：接 `item` prop，状态自持。 */
  component: Component
}

const providers: DetailPreviewProvider[] = []

/** 注册提供方（后注册覆盖先注册；同 id 重复注册 = 替换旧条目）。 */
export function registerDetailPreview(provider: DetailPreviewProvider): void {
  const idx = providers.findIndex((p) => p.id === provider.id)
  if (idx >= 0) providers.splice(idx, 1)
  providers.push(provider)
}

/** 按 id 注销（功能组件卸载/停用时）。 */
export function unregisterDetailPreview(id: string): void {
  const idx = providers.findIndex((p) => p.id === id)
  if (idx >= 0) providers.splice(idx, 1)
}

/** 解析条目的预览提供方：**从后往前**找第一个认领者（后注册优先）。无人认领 → null（详情页给占位）。 */
export function resolveDetailPreview(item: ItemView): DetailPreviewProvider | null {
  for (let i = providers.length - 1; i >= 0; i--) {
    const p = providers[i]!
    if (p.claims(item)) return p
  }
  return null
}

/** 已注册提供方（调试/设置页可见面用）。 */
export function listDetailPreviews(): readonly DetailPreviewProvider[] {
  return providers
}

// 内置默认提供方（D37）注册在 ./preview/builtinPreviews.ts——.vue 组件不得进契约链
// （本文件是 contribution 的依赖，纯逻辑测试经它拉入；D30 纪律）。
