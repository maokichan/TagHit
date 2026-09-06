<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RefreshCw, Search, X } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTagStore } from '../../stores/tag'

const props = defineProps<{ workspaceId: number }>()
const itemStore = useItemStore()
const workspaceStore = useWorkspaceStore()
const tagStore = useTagStore()

const hasPaths = computed(
  () => (workspaceStore.byId(props.workspaceId)?.paths.length ?? 0) > 0
)

/** 当前按标签筛选的标签名列表（用于展示筛选状态，可单独/全部清除） */
const activeTagFilters = computed(() =>
  itemStore.filter.tagIds
    .map((id) => tagStore.allTags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t != null)
)

onMounted(() => {
  void tagStore.refreshAll()
})

function onScan(): void {
  if (itemStore.scanning || !hasPaths.value) return
  void itemStore.scan(props.workspaceId)
}
</script>

<template>
  <div class="px-3 py-2 border-b border-[var(--border)] space-y-1.5">
    <div class="flex items-center gap-2">
      <div class="relative w-[400px] shrink-0">
        <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
        <input
          v-model="itemStore.filter.keyword"
          class="input pl-8 w-full"
          placeholder="过滤文件名（关键词）…"
          data-shortcut="search"
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

    <!-- 标签筛选状态：打标后在左侧"标签"面板点击标签即可筛选，此处展示并支持清除 -->
    <div v-if="activeTagFilters.length" class="flex items-center gap-1.5 flex-wrap">
      <span class="text-[11px] text-[var(--fg-dim)] shrink-0">筛选：</span>
      <button
        v-for="tag in activeTagFilters"
        :key="tag.id"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--accent)] text-white cursor-pointer hover:brightness-110 transition-colors"
        :title="`取消筛选 #${tag.name}`"
        @click="itemStore.toggleTagFilter(tag.id)"
      >
        #{{ tag.name }} <X :size="10" />
      </button>
      <button
        class="text-[11px] text-[var(--fg-dim)] hover:text-[var(--danger)] cursor-pointer underline"
        title="清除全部标签筛选"
        @click="itemStore.clearTagFilters()"
      >
        清除全部
      </button>
    </div>
  </div>
</template>
