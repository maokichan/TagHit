<script setup lang="ts">
/**
 * 来源根 —— **停靠面板呈现面**：活动栏窄面板。
 *
 * 分工（2026-09-12 裁决）：窄面板只做**就地轻量操作**——逐节点切可见性、只看某节点、
 * 挂载/卸载、看到"为什么少了条目"的计数；**批量与去留处置归全页**（一键恢复全部可见、
 * 退役根与脱根条目的清理/恢复）——窄面板空间有限且常驻，批量误触代价高，故只留入口。
 *
 * 外壳（宽度/边框/滚动）由壳的停靠面板外壳提供；数据与动作与全页共用 usePathManagement。
 */
import { onMounted } from 'vue'
import { Maximize2 } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { useFeatureContext } from '../context'
import { openFeatureTab } from '../tabs'
import { providePathManagement } from './usePathManagement'
import RootTree from './RootTree.vue'
import VisibilitySummaryBar from './VisibilitySummaryBar.vue'

const props = defineProps<{ workspaceId: string; side?: 'left' | 'right' }>()
const pm = providePathManagement(props.workspaceId)
const { error, mgmt } = pm
const itemStore = useItemStore()
const ctx = useFeatureContext()

/** 待处置的脱根条目数（入口按钮上的计数）。 */
function pending(): number {
  return (mgmt.value?.retired.length ?? 0) + (mgmt.value?.untrackedTotal ?? 0)
}

function openFullPage(): void {
  openFeatureTab('paths', '来源根', ctx?.workspaceId ?? props.workspaceId)
}

void onMounted(() => pm.refresh())
</script>

<template>
  <div class="px-3 py-3">
    <div class="flex items-center gap-1.5 mb-2">
      <span class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] flex-1">来源根</span>
      <button
        class="text-[11px] text-[var(--fg-dim)] hover:text-[var(--accent)] cursor-pointer inline-flex items-center gap-1"
        title="打开全页：批量改可见性、处置已卸载来源根与脱根条目"
        @click="openFullPage"
      >
        <Maximize2 :size="11" />全页
      </button>
    </div>

    <VisibilitySummaryBar />

    <div class="mt-2">
      <RootTree />
    </div>

    <!-- 重管理不在窄面板：只给入口与计数（一键批量/去留处置在全页） -->
    <button
      v-if="pending() > 0"
      class="mt-3 pt-2.5 border-t border-[var(--border)] w-full text-left flex items-center gap-1.5 text-[11px] text-[var(--fg-dim)] hover:text-[var(--accent)] cursor-pointer"
      title="打开全页：重新挂载 / 清理条目（不可恢复）/ 按目录逐组处置"
      @click="openFullPage"
    >
      <Maximize2 :size="11" class="shrink-0" />
      <span class="flex-1">已卸载来源根与脱根条目</span>
      <span class="tabular-nums">{{ pending() }} 条 · 去全页处置</span>
    </button>

    <div
      v-if="error"
      class="mt-2 px-2 py-1.5 rounded text-[11px]"
      style="background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger)"
    >
      {{ error }}
      <button class="ml-1 cursor-pointer opacity-70 hover:opacity-100" @click="error = ''">✕</button>
    </div>

    <div v-if="itemStore.scanning" class="mt-2 text-[11px] text-[var(--fg-dim)]">正在扫描…</div>
  </div>
</template>
