<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useItemStore } from '../../stores/item'
import type { PluginInfo } from '@shared/types/plugin'

const itemStore = useItemStore()
const plugins = ref<PluginInfo[]>([])
let unsub: (() => void) | null = null

onMounted(async () => {
  plugins.value = await window.api.plugin.list()
  unsub = window.api.on('event:scanProgress', (payload) => {
    itemStore.scanProgress = payload as never
  })
})
onUnmounted(() => unsub?.())

const statusText = computed(() => {
  if (itemStore.scanning && itemStore.scanProgress) {
    const p = itemStore.scanProgress
    if (p.phase === 'walk') return '正在遍历目录…'
    if (p.total > 0) return `正在扫描 ${p.processed}/${p.total}`
    return '正在计算哈希…'
  }
  if (itemStore.lastScanResult) {
    const r = itemStore.lastScanResult
    return `扫描完成：+${r.added} 新增 / ${r.updated} 更新 / ${r.missing} 缺失（${(r.durationMs / 1000).toFixed(1)}s）`
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
        :class="plugins.length > 0 ? 'bg-emerald-500' : 'bg-[var(--border)]'"
      />
      {{ plugins.length }} 插件
    </span>
  </footer>
</template>
