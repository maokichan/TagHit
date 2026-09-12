<script setup lang="ts">
/**
 * SurfaceHost —— 标准停靠容器（ARCHITECTURE §3.2 容器标准化）。
 * 所有功能组件经它渲染：槽查询结果（FeatureEntry）→ 惰性解析（direct 直连 /
 * async defineAsyncComponent）→ FeatureBoundary 错误隔离 → FeatureContext 注入。
 * 活动栏工具面板、显示面板块、内容区标签页共用本组件，只有 surface 与上下文不同；
 * 官方与 contributed 过同一容器——插件容器标准化的本体。
 */
import { computed, defineAsyncComponent, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { SquareArrowOutUpRight } from 'lucide-vue-next'
import type { FeatureEntry } from './registry'
import { provideFeatureContext, type FeatureContext } from './context'
import { useTabStore } from '../stores/tab'
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

/** 停靠面板右下角角标 → 打开该功能组件的内容标签页（全页复用同一实现绑定）。 */
const router = useRouter()
const tabStore = useTabStore()
function openFeatureTab(): void {
  const f = props.feature
  if (f == null) return
  tabStore.openFeature(f.manifest.id, f.manifest.title)
  router.push(`/feature/${f.manifest.id}`)
}
</script>

<template>
  <div v-if="feature != null" class="relative h-full min-h-0">
    <FeatureBoundary :label="feature.manifest.title">
      <component
        :is="directComp ?? asyncComp"
        v-if="directComp != null || asyncComp != null"
        v-bind="componentProps"
      />
    </FeatureBoundary>
    <button
      v-if="surface === 'activityBar' && (directComp != null || asyncComp != null)"
      class="absolute bottom-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded
             bg-[var(--bg)] border border-[var(--border)] text-[var(--fg-dim)]
             hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-colors cursor-pointer"
      :title="`打开「${feature.manifest.title}」标签页`"
      @click="openFeatureTab"
    >
      <SquareArrowOutUpRight :size="11" />
    </button>
  </div>
</template>
