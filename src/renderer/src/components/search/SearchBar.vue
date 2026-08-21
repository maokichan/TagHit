<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw, Search } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { useWorkspaceStore } from '../../stores/workspace'

const props = defineProps<{ workspaceId: number }>()
const itemStore = useItemStore()
const workspaceStore = useWorkspaceStore()

const hasPaths = computed(
  () => (workspaceStore.byId(props.workspaceId)?.paths.length ?? 0) > 0
)

function onScan(): void {
  if (itemStore.scanning || !hasPaths.value) return
  void itemStore.scan(props.workspaceId)
}
</script>

<template>
  <div class="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
    <div class="relative w-[400px] shrink-0">
      <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
      <input
        v-model="itemStore.filter.keyword"
        class="input pl-8 w-full"
        placeholder="过滤文件名（关键词）…"
        @input="itemStore.setKeyword(($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- 间隔区：把扫描按钮推到搜索栏最右侧 -->
    <div class="flex-1" />

    <span class="text-[11px] text-[var(--fg-dim)] shrink-0">{{ itemStore.total }} 项</span>

    <button
      class="btn btn-primary shrink-0 ml-2"
      :disabled="itemStore.scanning || !hasPaths"
      :title="hasPaths ? '扫描（目录变更后自动触发）' : '未配置路径，请在左侧活动栏添加'"
      @click="onScan"
    >
      <RefreshCw :size="14" :class="{ 'animate-spin': itemStore.scanning }" />
      {{ itemStore.scanning ? '扫描中…' : '扫描' }}
    </button>
  </div>
</template>
