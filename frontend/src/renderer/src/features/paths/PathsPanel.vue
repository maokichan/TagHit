<script setup lang="ts">
/**
 * 路径管理（来源根）——**停靠面板呈现面**：活动栏窄面板。
 * 外壳（宽度/边框/滚动）由壳的停靠面板外壳提供；此处只出内容。
 * 与全页呈现（PathsFullPage.vue）共用同一份数据与动作（usePathManagement），
 * 差异只在布局：窄面板纵向堆叠，全页面左右两栏。
 */
import { onMounted } from 'vue'
import { providePathManagement } from './usePathManagement'
import RootTree from './RootTree.vue'
import VisibilitySummaryBar from './VisibilitySummaryBar.vue'
import RelocationPanel from './RelocationPanel.vue'

const props = defineProps<{ workspaceId: string; side?: 'left' | 'right' }>()
const pm = providePathManagement(props.workspaceId)
const { error, mgmt } = pm
void onMounted(() => pm.refresh())
</script>

<template>
  <div class="px-3 py-3">
    <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">来源根</div>

    <VisibilitySummaryBar />

    <div class="mt-2">
      <RootTree />
    </div>

    <div
      v-if="error"
      class="mt-2 px-2 py-1.5 rounded text-[11px]"
      style="background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger)"
    >
      {{ error }}
      <button class="ml-1 cursor-pointer opacity-70 hover:opacity-100" @click="error = ''">✕</button>
    </div>

    <div
      v-if="mgmt && (mgmt.retired.length || mgmt.untrackedTotal)"
      class="mt-3 pt-2.5 border-t border-[var(--border)]"
    >
      <RelocationPanel />
    </div>
  </div>
</template>
