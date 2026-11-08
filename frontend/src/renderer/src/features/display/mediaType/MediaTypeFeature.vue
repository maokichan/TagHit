<script setup lang="ts">
/**
 * 功能组件：格式筛选（displayPanel 区块）。
 *
 * 类别 = 展示推导（lib/mediaTypes.ts 的可配置映射）；筛选下推 ItemsQuery.extensions，
 * 数据流不变（改意图 → 窄桥用例 → 失效重查）。块面呈现的是**当前视图条件下真实存在的
 * 类别**（每类别一次 limit:1 的 browse 取 total），数量为 0 的类别不出现——
 * 视图里有什么格式，这里就有什么可点；激活中的筛选即使计数归零也保持可见（不然无法取消）。
 */
import { onMounted, ref, watch } from 'vue'
import { useItemStore } from '../../../stores/item'
import {
  FILTERABLE_MEDIA_TYPES,
  MEDIA_TYPE_LABEL,
  type FilterableMediaType,
} from '../../../lib/mediaTypes'

const itemStore = useItemStore()

const counts = ref<Partial<Record<FilterableMediaType, number>>>({})
let seq = 0
let timer: number | undefined

async function refresh(): Promise<void> {
  const s = ++seq
  const c = await itemStore.categoryCounts()
  if (s === seq) counts.value = c
}

function schedule(): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(refresh, 250)
}

onMounted(refresh)
// 计数随视图条件走：换工作区 / 重查完成（total 变化）/ 范围、标签、关键字变化
watch(
  () =>
    [
      itemStore.viewWorkspaceId,
      itemStore.total,
      itemStore.scopeDirPath,
      itemStore.filter.tagIds.length,
      itemStore.filter.keyword
    ] as const,
  schedule
)

function isActive(t: FilterableMediaType): boolean {
  return itemStore.filter.mediaTypes.includes(t)
}
</script>

<template>
  <div>
    <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">{{ $t('display.mediaType.label') }}</div>
    <div class="flex gap-1.5 flex-wrap">
      <button
        v-for="t in FILTERABLE_MEDIA_TYPES"
        :key="t"
        v-show="isActive(t) || (counts[t] ?? 0) > 0"
        class="btn text-[12px] justify-center"
        :class="isActive(t) ? 'btn-primary' : ''"
        :title="MEDIA_TYPE_LABEL[t]"
        @click="itemStore.toggleMediaType(t)"
      >
        {{ MEDIA_TYPE_LABEL[t] }}
        <span class="tabular-nums opacity-70">{{ counts[t] ?? '…' }}</span>
      </button>
    </div>
  </div>
</template>
