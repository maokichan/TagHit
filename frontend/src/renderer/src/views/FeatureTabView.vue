<script setup lang="ts">
/**
 * 功能组件标签页视图：contentTab 槽的落点（壳只查注册表并交 SurfaceHost 渲染）。
 * 组件自持内容状态，关闭标签即销毁（DECISIONS 2026-09-07 状态归属裁决）。
 *
 * 工作区上下文取**标签项上固化的值**（打开瞬间记录）——不能用 activeWorkspaceId：
 * 本标签成为活动标签后它即为 null（活动标签不是工作区），曾导致"从工作区打开却提示先打开工作区"。
 *
 * 全页呈现**不复用窄面板**（D22）：只有 manifest 声明了 contentTab（= 提供全页呈现）
 * 的功能组件才在这里渲染全页实现；未声明者给出明确占位。
 */
import { computed } from 'vue'
import { declaresFullPage, getFeature } from '../features/registry'
import { useTabStore, type FeatureTab } from '../stores/tab'
import SurfaceHost from '../features/SurfaceHost.vue'

const props = defineProps<{ featureId: string }>()

const feature = computed(() => getFeature(props.featureId) ?? null)
const tabStore = useTabStore()
const tab = computed(
  () =>
    tabStore.tabs.find(
      (t): t is FeatureTab => t.kind === 'feature' && t.featureId === props.featureId
    ) ?? null
)
/** 标签项固化的上下文优先；缺失则回落当前活动工作区（例如从主页直接开的标签页）。 */
const workspaceId = computed(() => tab.value?.workspaceId ?? tabStore.activeWorkspaceId)
const featureProps = computed(() =>
  workspaceId.value != null ? { workspaceId: workspaceId.value } : {}
)
</script>

<template>
  <div class="h-full min-h-0">
    <SurfaceHost
      v-if="feature != null && declaresFullPage(feature)"
      :feature="feature"
      surface="contentTab"
      :workspace-id="workspaceId"
      :component-props="featureProps"
    />
    <div v-else class="h-full flex items-center justify-center px-6 text-center">
      <p class="text-[12px] text-[var(--fg-dim)] leading-relaxed">
        <template v-if="feature == null">功能组件不存在或已被移除（{{ featureId }}）</template>
        <template v-else>
          「{{ feature.manifest.title }}」尚未提供全页呈现。<br />
          全页呈现不复用窄面板——需为该功能组件单独实现（见 DECISIONS D22）。
        </template>
      </p>
    </div>
  </div>
</template>
