import { inject, provide, reactive, type InjectionKey } from 'vue'

/**
 * FeatureContext —— 壳注入给功能组件的挂载上下文（SurfaceHost provide）。
 * 声明式依赖，替代 props 在各槽蔓延：组件经 useFeatureContext 读取，
 * 数据仍走 HostApi/窄桥，上下文只描述"挂在哪"。
 */
export type FeatureSurface = 'activityBar' | 'displayPanel' | 'settings' | 'contentTab'

export interface FeatureContext {
  surface: FeatureSurface
  workspaceId: string | null
  side: 'left' | 'right' | null
}

const KEY: InjectionKey<FeatureContext> = Symbol('featureContext')

export function provideFeatureContext(ctx: FeatureContext): void {
  provide(KEY, reactive(ctx))
}

export function useFeatureContext(): FeatureContext | null {
  return inject(KEY, null)
}
