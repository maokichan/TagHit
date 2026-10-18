<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import SearchBar from '../components/search/SearchBar.vue'
import ItemGrid from '../components/item/ItemGrid.vue'
import { useItemStore } from '../stores/item'
import { useTabStore } from '../stores/tab'
import { useTagStore } from '../stores/tag'
import { useWorkspaceStore } from '../stores/workspace'
import { itemRoute } from '../features/tabs'
import { type SelectIntent } from '../features/selection'
import type { ItemContext } from '@shared/contract'
import type { ItemView } from '../lib/viewModel'

const props = defineProps<{ id: string }>()
const router = useRouter()
const itemStore = useItemStore()
const workspaceStore = useWorkspaceStore()
const tabStore = useTabStore()
const tagStore = useTagStore()

const workspaceId = props.id

/** 卡片标签点击 = 翻转搜索框里的该标签词元（筛选的唯一书写处在搜索框，词元留在栏里随时可改）。 */
function onTagClick(tagId: string): void {
  const tag = tagStore.allTags.find((t) => t.id === tagId)
  if (tag != null) itemStore.toggleSearchTagToken(tag.name)
}

/** 滚动记忆键：工作区 + 视图签名——条件变了不还原旧位置。 */
const memKey = computed(() => `${workspaceId}|${itemStore.viewSignature()}`)

let debounce: number | undefined
function reload(): void {
  void itemStore.load(workspaceId)
}

// 切换工作区标签：浏览范围属于"当前视图"，换工作区即清空（否则会用上一个工作区的目录范围过滤）
watch(
  () => workspaceId,
  () => {
    itemStore.setScope(null)
    reload()
  }
)

watch(
  () =>
    [
      itemStore.filter.tagIds.length,
      itemStore.filter.excludedTagIds.length,
      itemStore.filter.mediaTypes.length,
      itemStore.filter.untaggedOnly,
      itemStore.sortBy,
      itemStore.sortDir,
      itemStore.scopeDirPath
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
  // 视图条件没变（从详情页等处切回来）→ 就地刷新：不闪"加载中"、不回第一页；
  // 滚动位置由 ItemGrid 按 memKey（工作区|视图签名）还原——浏览位置跨"打开-返回"保持
  if (
    itemStore.viewWorkspaceId === workspaceId &&
    itemStore.viewSig === itemStore.viewSignature() &&
    itemStore.items.length > 0
  ) {
    await itemStore.refreshInPlace(workspaceId)
  } else {
    reload()
  }
})

function openItem(item: ItemView): void {
  // 双击打开详情 = 新开一个条目标签页（当前工作区标签不受影响）；
  // 顺序上下文在此固化：详情页翻页沿的就是网格此刻的排序 + 筛选 + 范围
  const context: ItemContext = { workspaceId, ...itemStore.orderContext() }
  tabStore.openItem(item.id, workspaceId, item.title, context)
  router.push(itemRoute(item.id, context))
}

function selectItem(item: ItemView, intent: SelectIntent): void {
  // 选择意图由壳的选择模型解释（replace/toggle/range），状态变更收口在 item store
  itemStore.applySelection(item, intent)
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- 搜索 + 计数 + 扫描（工作区名在标签页上已有，此处不再重复） -->
    <SearchBar :workspace-id="workspaceId" />

    <!-- 多选状态与批量动作在底边栏（StatusBar）：搜索栏下不再有随选择浮沉的操作条 -->

    <div
      v-if="itemStore.scanError"
      class="error-note mx-3 mt-2 items-center"
    >
      <span class="flex-1">扫描失败：{{ itemStore.scanError }}</span>
      <button @click="itemStore.scanError = null">
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
        :mem-key="memKey"
        @open="openItem"
        @pick="selectItem"
        @blank="itemStore.clearSelection()"
        @marquee="(ids, intent) => itemStore.setSelection(ids, intent)"
        @tag-click="onTagClick"
        @load-more="itemStore.loadMore(workspaceId)"
      />
    </div>
  </div>
</template>
