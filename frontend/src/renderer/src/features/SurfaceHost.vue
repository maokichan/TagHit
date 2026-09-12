<script setup lang="ts">
/**
 * SurfaceHost —— 标准停靠容器（ARCHITECTURE §3.2 容器标准化）。
 * 所有功能组件经它渲染：槽查询结果（FeatureEntry）→ 按呈现面选实现 →
 * 惰性解析（direct 直连 / async defineAsyncComponent）→ **壳级外壳** → FeatureBoundary 错误隔离
 * → FeatureContext 注入。活动栏面板、显示面板块、内容区标签页共用本组件。
 *
 * **容器归壳**（2026-09-12）：外壳由呈现面决定，功能组件只出内容、不自绘宽度与边框——
 * - `activityBar` → 停靠面板外壳（壳级宽度 `--panel-width` + 左右边框 + 角标）
 * - `contentTab` → 全页外壳（页头 + 占满内容区，**不套窄面板**）
 * - `displayPanel` / `settings` → 无外壳（宿主面板/设置页自带分区容器）
 */
import { computed, defineAsyncComponent, type Component } from 'vue'
import { SquareArrowOutUpRight } from 'lucide-vue-next'
import { declaresFullPage, type FeatureEntry } from './registry'
import { provideFeatureContext, type FeatureContext } from './context'
import { openFeatureTab } from './tabs'
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
  return (props.surface === 'contentTab' ? (f.impl.fullPage ?? f.impl.component) : f.impl.component) ?? null
})

const asyncComp = computed<Component | null>(() => {
  const f = props.feature
  if (f == null || f.impl.type !== 'async') return null
  const load = f.impl.load
  const surface = props.surface
  return defineAsyncComponent({
    loader: async () => {
      const parts = await load()
      const c = surface === 'contentTab' ? (parts.fullPage ?? parts.component) : parts.component
      if (c == null) throw new Error(`${f.manifest.id} 在 ${surface} 呈现面无实现绑定`)
      return c
    },
    delay: 0
  })
})

const implAvailable = computed(() => directComp.value != null || asyncComp.value != null)
/** 角标只在**声明了全页呈现**时出现（未声明的功能组件没有全页可开）。 */
const canOpenFullPage = computed(
  () => props.surface === 'activityBar' && implAvailable.value && declaresFullPage(props.feature)
)

/** 停靠面板右下角角标 → 打开该功能组件的全页呈现标签页（上下文在打开瞬间固化）。 */
function openFullPage(): void {
  const f = props.feature
  if (f == null) return
  openFeatureTab(f.manifest.id, f.manifest.title, props.workspaceId ?? null)
}
</script>

<template>
  <!-- 停靠面板外壳：宽度/边框/滚动归壳（功能组件不得自定） -->
  <div v-if="feature != null && surface === 'activityBar'" class="relative h-full min-h-0 shrink-0">
    <aside
      class="w-[var(--panel-width)] h-full bg-[var(--bg-elev)] overflow-y-auto"
      :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
    >
      <FeatureBoundary :label="feature.manifest.title">
        <component
          :is="directComp ?? asyncComp"
          v-if="implAvailable"
          v-bind="componentProps"
        />
      </FeatureBoundary>
    </aside>
    <button
      v-if="canOpenFullPage"
      class="absolute bottom-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded
             bg-[var(--bg)] border border-[var(--border)] text-[var(--fg-dim)]
             hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-colors cursor-pointer"
      :title="`打开「${feature.manifest.title}」全页`"
      @click="openFullPage"
    >
      <SquareArrowOutUpRight :size="11" />
    </button>
  </div>

  <!-- 全页外壳：占满内容区 + 页头；不含窄面板 -->
  <div v-else-if="feature != null && surface === 'contentTab'" class="h-full min-h-0 flex flex-col">
    <header
      class="shrink-0 flex items-center gap-2 h-9 px-4 border-b border-[var(--border)] bg-[var(--bg-elev)]"
    >
      <span class="text-[12px] font-medium truncate">{{ feature.manifest.title }}</span>
      <span v-if="feature.manifest.source === 'contributed'" class="text-[10px] text-[var(--fg-dim)]">插件</span>
    </header>
    <div class="flex-1 min-h-0">
      <FeatureBoundary :label="feature.manifest.title">
        <component
          :is="directComp ?? asyncComp"
          v-if="implAvailable"
          v-bind="componentProps"
        />
        <div v-else class="h-full flex items-center justify-center px-6 text-center">
          <p class="text-[12px] text-[var(--fg-dim)] leading-relaxed">
            功能组件「{{ feature.manifest.title }}」声明了全页呈现，但未绑定全页实现。<br />
            全页呈现**不复用窄面板**——需为该功能组件提供专门的全页内容。
          </p>
        </div>
      </FeatureBoundary>
    </div>
  </div>

  <!-- 无外壳呈现面（displayPanel 块 / 设置分区）：宿主容器自带分区样式 -->
  <FeatureBoundary v-else-if="feature != null" :label="feature.manifest.title">
    <component
      :is="directComp ?? asyncComp"
      v-if="implAvailable"
      v-bind="componentProps"
    />
  </FeatureBoundary>
</template>
