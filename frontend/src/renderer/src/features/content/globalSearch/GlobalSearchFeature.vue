<script setup lang="ts">
/**
 * 功能组件：全局搜索（contentTab 槽的第一个官方功能，也是 contentTab 机制测试桩）。
 * 跨工作区条目检索（items.query titleContains，经窄桥），结果瀑布流点开进条目详情。
 * 内容状态（关键词/结果）由本组件自持，关闭标签即销毁——contentTab 状态归属裁决。
 */
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'
import { api } from '@shared/api'
import { toItemView, type ItemView } from '../../../lib/viewModel'
import { useTabStore } from '../../../stores/tab'
import ItemCard from '../../../components/item/ItemCard.vue'

const router = useRouter()
const tabStore = useTabStore()

const query = ref('')
const results = ref<ItemView[]>([])
const loading = ref(false)
let debounce: number | undefined

watch(query, () => {
  window.clearTimeout(debounce)
  debounce = window.setTimeout(runSearch, 250)
})

async function runSearch(): Promise<void> {
  const q = query.value.trim()
  if (!q) {
    results.value = []
    return
  }
  loading.value = true
  try {
    const hits = await api.items.query({ titleContains: q, limit: 60 })
    results.value = hits.map(toItemView)
  } finally {
    loading.value = false
  }
}

function openItem(item: ItemView): void {
  tabStore.openItem(item.id, null, item.title)
  router.push(`/item/${item.id}`)
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-3xl mx-auto px-6 py-6">
      <div class="relative w-full mb-4">
        <Search :size="15" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
        <input
          v-model="query"
          class="input pl-9 w-full py-2"
          placeholder="全局搜索条目名关键词…"
          data-shortcut="search"
        />
      </div>

      <div v-if="query.trim()" class="text-[11px] text-[var(--fg-dim)] mb-2">
        {{ loading ? '搜索中…' : `命中 ${results.length} 项` }}
      </div>
      <div
        v-if="query.trim() && results.length"
        class="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3"
      >
        <ItemCard
          v-for="item in results"
          :key="item.id"
          :item="item"
          :interactive-tags="false"
          class="break-inside-avoid"
          @open="openItem"
          @select="openItem"
        />
      </div>
      <p
        v-if="query.trim() && !loading && results.length === 0"
        class="text-[12px] text-[var(--fg-dim)]"
      >
        没有命中的条目。
      </p>
    </div>
  </div>
</template>
