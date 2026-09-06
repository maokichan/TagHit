<script setup lang="ts">
import { computed } from 'vue'
import { useItemStore } from '../../stores/item'

/** 状态栏：扫描状态 + 插件占位（插件面板不在契约 v0，恒为 0）。 */
const itemStore = useItemStore()

const PLUGIN_COUNT = 0

const statusText = computed(() => {
  if (itemStore.scanning) return '正在扫描…'
  if (itemStore.lastScanResult) {
    const r = itemStore.lastScanResult
    return `扫描完成：+${r.itemsCreated} 新增 / ${r.itemsUpdated} 更新 / ${r.itemsMissing} 缺失（${r.scannedRoots} 个来源根）`
  }
  return null
})
</script>

<template>
  <footer class="flex items-center gap-3 px-3 h-7 text-[11px] text-[var(--fg-dim)] border-t border-[var(--border)] bg-[var(--bg-elev)]">
    <span v-if="statusText" class="flex-1 truncate">{{ statusText }}</span>
    <span v-else class="flex-1" />

    <span class="flex items-center gap-1">
      <span class="inline-block w-1.5 h-1.5 rounded-full"
        :class="PLUGIN_COUNT > 0 ? 'bg-emerald-500' : 'bg-[var(--border)]'"
      />
      {{ PLUGIN_COUNT }} 插件
    </span>
  </footer>
</template>
