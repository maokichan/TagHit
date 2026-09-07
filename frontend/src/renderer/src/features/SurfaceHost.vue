<script setup lang="ts">
/**
 * SurfaceHost —— 标准停靠容器（ARCHITECTURE §3.2 容器标准化）。
 * 所有功能组件经它渲染：槽查询结果（FeatureEntry）→ 惰性解析（direct 直连 /
 * async defineAsyncComponent）→ FeatureBoundary 错误隔离 → FeatureContext 注入。
 * 活动栏工具面板、显示面板块、内容区标签页共用本组件，只有 surface 与上下文不同；
 * 官方与 contributed 过同一容器——插件容器标准化的本体。
 */
import { computed, defineAsyncComponent, type Component } from 'vue'
import type { FeatureEntry } from './registry'
import { provideFeatureContext, type FeatureContext } from './context'
import FeatureBoundary from './FeatureBoundary.vue'

const props = defineProps<{
  feature: FeatureEntry | null
  surface: FeatureContext['surface']
  workspaceId?: string | null
  side?: 'left' | 'right' | null
  /** 透传给组件的槽特有 props（如活动栏面板的 workspace-id）；新组件应改用 context 注入 */
  componentProps?: Record<string, unknown>
}>()

provideFeatureContext({
  surface: props.surface,
  workspaceId: props.workspaceId ?? null,
  side: props.side ?? null
})

const directComp = computed<Component | null>(() => {
  const f = props.feature
  if (f == null || f.impl.type !== 'direct') return null
  return f.impl.component ?? null
})

const asyncComp = computed<Component | null>(() => {
  const f = props.feature
  if (f == null || f.impl.type !== 'async') return null
  const load = f.impl.load
  return defineAsyncComponent({
    loader: async () => {
      const mod = await load()
      return mod.component
    },
    delay: 0
  })
})
</script>

<template>
  <FeatureBoundary v-if="feature != null" :label="feature.manifest.title">
    <component
      :is="directComp ?? asyncComp"
      v-if="directComp != null || asyncComp != null"
      v-bind="componentProps"
    />
  </FeatureBoundary>
</template>
