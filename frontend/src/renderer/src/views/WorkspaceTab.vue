<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import SearchBar from '../components/search/SearchBar.vue'
import ItemGrid from '../components/item/ItemGrid.vue'
import { useItemStore } from '../stores/item'
import { useTabStore } from '../stores/tab'
import { useWorkspaceStore } from '../stores/workspace'
import { openBatchTagDialog } from '../features/services/batchTag'
import type { ItemView } from '../lib/viewModel'

const props = defineProps<{ id: string }>()
const router = useRouter()
const itemStore = useItemStore()
const workspaceStore = useWorkspaceStore()
const tabStore = useTabStore()

const workspaceId = props.id

let debounce: number | undefined
function reload(): void {
  void itemStore.load(workspaceId)
}

watch(
  () =>
    [
      workspaceId,
      itemStore.filter.tagIds.length,
      itemStore.sortBy,
      itemStore.sortDir
    ] as const,
  reload
)
watch(
  () => itemStore.filter.keyword,
  () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(reload, 250)
  }
)

onMounted(async () => {
  await workspaceStore.refresh()
  reload()
})

function openItem(item: ItemView): void {
  // 双击打开详情 = 新开一个条目标签页（当前工作区标签不受影响）
  tabStore.openItem(item.id, workspaceId, item.title)
  router.push(`/item/${item.id}?workspace=${workspaceId}`)
}

function selectItem(item: ItemView): void {
  itemStore.select(item)
}

function toggleSelectItem(item: ItemView): void {
  itemStore.toggleSelect(item)
}

function openBatchTag(mode: 'add' | 'remove'): void {
  openBatchTagDialog({
    mode,
    workspaceId,
    count: itemStore.selectedIds.length,
    onApply: async (m, tagIds) => {
      if (m === 'add') await itemStore.tagSelected(workspaceId, tagIds)
      else await itemStore.untagSelected(workspaceId, tagIds)
    }
  })
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- 搜索 + 计数 + 扫描（工作区名在标签页上已有，此处不再重复） -->
    <SearchBar :workspace-id="workspaceId" />

    <!-- 多选操作条：Ctrl/Cmd+单击聚合多选后出现 -->
    <div
      v-if="itemStore.selectedIds.length > 0"
      class="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-elev)] text-[12px]"
    >
      <span class="text-[var(--fg-dim)]">已选 {{ itemStore.selectedIds.length }} 项</span>
      <button class="btn text-[11px]" @click="openBatchTag('add')">批量打标签…</button>
      <button class="btn text-[11px]" @click="openBatchTag('remove')">批量移除标签…</button>
      <button class="btn text-[11px] ml-auto" @click="itemStore.clearSelection()">取消选择</button>
    </div>

    <div
      v-if="itemStore.scanError"
      class="mx-3 mt-2 px-3 py-2 rounded flex items-center gap-2 text-[12px]"
      style="background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger)"
    >
      <span class="flex-1">扫描失败：{{ itemStore.scanError }}</span>
      <button class="cursor-pointer opacity-70 hover:opacity-100" @click="itemStore.scanError = null">
        ✕
      </button>
    </div>

    <div class="flex-1 min-h-0">
      <ItemGrid
        :items="itemStore.items"
        :loading="itemStore.loading"
        :selected-id="itemStore.selected?.id ?? null"
        :selected-ids="itemStore.selectedIds"
        :has-more="itemStore.hasMore"
        @open="openItem"
        @select="selectItem"
        @select-toggle="toggleSelectItem"
        @tag-click="itemStore.toggleTagFilter"
        @load-more="itemStore.loadMore(workspaceId)"
      />
    </div>
  </div>
</template>
