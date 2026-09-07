<script setup lang="ts">
/**
 * 功能组件标签页视图：contentTab 槽的落点（壳只查注册表并交 SurfaceHost 渲染）。
 * 组件自持内容状态，关闭标签即销毁（DECISIONS 2026-09-07 状态归属裁决）。
 */
import { computed } from 'vue'
import { getFeature } from '../features/registry'
import SurfaceHost from '../features/SurfaceHost.vue'

const props = defineProps<{ featureId: string }>()

const feature = computed(() => getFeature(props.featureId) ?? null)
</script>

<template>
  <div class="h-full min-h-0">
    <SurfaceHost v-if="feature != null" :feature="feature" surface="contentTab" />
    <div v-else class="h-full flex items-center justify-center text-[var(--fg-dim)] text-sm">
      功能组件不存在或已被移除（{{ featureId }}）
    </div>
  </div>
</template>
