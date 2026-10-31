/**
 * 插件内持有的激活上下文：activate 时由入口绑定，组件经此取 HostApi。
 * 三方纪律：运行时能力只经 ctx.hostApi（冻结面），不 import 窄桥全量。
 */

import type { ContributionContext } from '@renderer/features/contribution'

let bound: ContributionContext | null = null

export function bindContext(ctx: ContributionContext): void {
  bound = ctx
}

export function hostApi(): ContributionContext['hostApi'] {
  if (bound == null) throw new Error('audioPlayer 未激活（bindContext 未调用）')
  return bound.hostApi
}
