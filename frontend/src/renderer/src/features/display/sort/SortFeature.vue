<script setup lang="ts">
/**
 * 功能组件：排序（displayPanel 区块）
 * 排序白名单单一事实来源在 ItemService（SortKeyRegistry，RFC §5.7）：
 * 渲染层从主进程查询可用排序键，驱动式渲染下拉，不硬编码。
 */
import { onMounted, ref } from 'vue'
import { ArrowDownWideNarrow, ArrowUpWideNarrow } from 'lucide-vue-next'
import { useItemStore } from '../../../stores/item'

const itemStore = useItemStore()

const sortOptions = ref<Array<{ key: string; label: string }>>([])

onMounted(async () => {
  try {
    sortOptions.value = await window.api.item.listSortKeys()
  } catch {
    sortOptions.value = []
  }
})
</script>

<template>
  <div>
    <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">排序</div>
    <div class="flex gap-1.5">
      <select v-model="itemStore.sortBy" class="input flex-1 min-w-0 text-[12px]" title="排序字段">
        <option v-for="o in sortOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>
      <button
        class="btn"
        :title="itemStore.sortDir === 'asc' ? '升序' : '降序'"
        @click="itemStore.toggleSortDir()"
      >
        <ArrowUpWideNarrow v-if="itemStore.sortDir === 'asc'" :size="14" />
        <ArrowDownWideNarrow v-else :size="14" />
      </button>
    </div>
  </div>
</template>
