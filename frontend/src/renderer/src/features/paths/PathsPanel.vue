<script setup lang="ts">
/**
 * 来源根 —— **停靠面板呈现面**：活动栏窄面板。
 *
 * 分工（用户裁定后收紧）：窄面板只做**就地轻量操作**——逐节点切可见性、
 * 只看某节点、挂载/卸载，以及"为什么少了条目"的计数解释。**批量与去留处置全在全页**；
 * 全页入口**只保留壳的右下角角标**（不在面板里再放按钮——同一件事一个入口）。
 *
 * 外壳（宽度/边框/滚动/角标）由壳的停靠面板外壳提供；数据与动作与全页共用 usePathManagement。
 */
import { onMounted } from 'vue'
import { providePathManagement } from './usePathManagement'
import RootTree from './RootTree.vue'
import VisibilitySummaryBar from './VisibilitySummaryBar.vue'

const props = defineProps<{ workspaceId: string; side?: 'left' | 'right' }>()
const pm = providePathManagement(props.workspaceId)
const { error } = pm
void onMounted(() => pm.refresh())
</script>

<template>
  <div class="px-3 py-3">
    <div class="panel-label mb-2">{{ $t('paths.title') }}</div>

    <VisibilitySummaryBar />

    <div class="mt-2">
      <RootTree />
    </div>

    <div v-if="error" class="error-note mt-2">
      {{ error }}
      <button class="ml-1" @click="error = ''">✕</button>
    </div>
  </div>
</template>
