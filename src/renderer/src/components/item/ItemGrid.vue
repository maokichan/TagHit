<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Inbox } from 'lucide-vue-next'
import type { ItemWithTags } from '@shared/types/item'
import { useUiStore } from '../../stores/ui'
import ItemCard from './ItemCard.vue'

const props = defineProps<{
  items: ItemWithTags[]
  loading: boolean
  interactiveTags?: boolean
  selectedId?: number | null
  hasMore?: boolean
}>()
const emit = defineEmits<{
  (e: 'open', item: ItemWithTags): void
  (e: 'select', item: ItemWithTags): void
  (e: 'tag-click', tagId: number): void
  (e: 'load-more'): void
}>()
const uiStore = useUiStore()

/* ── 布局常量（与 ItemCard 保持一致） ── */
const PAD = 12 // p-3
const GAP = 12 // gap-3
const MIN_COL = 180
const INFO_H = 56 // ItemCard 信息区固定高度（标题+标签一行）
const MAX_RATIO = 2.2
const BUFFER = 800 // 视口外预渲染缓冲（像素）

/* ── 滚动容器度量：scrollEl 在条目加载后才渲染，须 watch 出现即测量 ── */
const scrollEl = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewH = ref(0)
const viewW = ref(0)

let rafId = 0
function onScroll(): void {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    if (scrollEl.value) {
      scrollTop.value = scrollEl.value.scrollTop
      viewH.value = scrollEl.value.clientHeight
    }
  })
}

let resizeObs: ResizeObserver | null = null
function measure(): void {
  const el = scrollEl.value
  if (!el) return
  scrollTop.value = el.scrollTop
  viewH.value = el.clientHeight
  viewW.value = el.clientWidth
}

watch(
  scrollEl,
  (el, _old, onCleanup) => {
    if (!el) return
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    resizeObs?.disconnect()
    resizeObs = new ResizeObserver(measure)
    resizeObs.observe(el)
    onCleanup(() => {
      el.removeEventListener('scroll', onScroll)
      resizeObs?.disconnect()
      resizeObs = null
    })
  },
  { flush: 'post' }
)

onUnmounted(() => {
  scrollEl.value?.removeEventListener('scroll', onScroll)
  resizeObs?.disconnect()
  if (rafId) cancelAnimationFrame(rafId)
})

/* ── 布局计算：瀑布流 = JS 列分配（追加不动旧卡片）；网格/列表 = 均匀行 ── */
function ratioOf(item: ItemWithTags): number {
  if (item.width && item.height && item.height > 0) {
    const r = item.width / item.height
    return Math.min(Math.max(r, 1 / MAX_RATIO), MAX_RATIO)
  }
  return 4 / 3
}

const isMasonry = computed(() => uiStore.layoutMode === 'masonry')

interface LayoutResult {
  places: { item: ItemWithTags; left: number; top: number; width: number; height: number }[]
  totalH: number
  cols: number
  colW: number
  cardH: number
  rowH: number
}

const EMPTY_LAYOUT: LayoutResult = { places: [], totalH: 0, cols: 1, colW: 0, cardH: 0, rowH: 0 }

const layout = computed<LayoutResult>(() => {
  const w = viewW.value
  if (w < MIN_COL + PAD * 2) return EMPTY_LAYOUT
  const items = props.items
  const cols = Math.min(Math.max(2, Math.floor((w - PAD * 2 + GAP) / (MIN_COL + GAP))), 8)
  const colW = (w - PAD * 2 - GAP * (cols - 1)) / cols
  const infoH = uiStore.showTitles ? INFO_H : 0

  if (isMasonry.value) {
    // 瀑布流：按当前最短列分配，已放置的卡片位置永不改变（追加新页不跳动）
    const colHeights = new Array<number>(cols).fill(0)
    const places: LayoutResult['places'] = []
    for (const item of items) {
      let c = 0
      for (let k = 1; k < cols; k++) if (colHeights[k] < colHeights[c]) c = k
      const mediaH = colW / ratioOf(item)
      const h = mediaH + infoH
      places.push({ item, left: c * (colW + GAP), top: colHeights[c], width: colW, height: h })
      colHeights[c] += h + GAP
    }
    const maxH = colHeights.reduce((a, b) => Math.max(a, b), 0)
    return { places, totalH: Math.max(0, maxH - GAP + PAD * 2), cols, colW, cardH: 0, rowH: 0 }
  }

  // 网格 / 列表：均匀单元高度（media 4:3 + 信息区），行切片虚拟化
  const mediaW = uiStore.layoutMode === 'list' ? w - PAD * 2 : colW
  const cardH = mediaW * (3 / 4) + infoH
  const rowH = cardH + GAP
  const totalRows = Math.ceil(items.length / cols)
  return {
    places: [],
    totalH: Math.max(0, totalRows * rowH - GAP + PAD),
    cols,
    colW,
    cardH,
    rowH
  }
})

/* ── 可见范围 ── */
const visibleMasonry = computed(() => {
  const top = scrollTop.value - BUFFER
  const bottom = scrollTop.value + viewH.value + BUFFER
  return layout.value.places.filter((p) => p.top + p.height >= top && p.top <= bottom)
})

const rowSlice = computed(() => {
  const { rowH, cols } = layout.value
  const items = props.items
  if (rowH <= 0 || items.length === 0) return { slice: [] as ItemWithTags[], topPad: 0, bottomPad: 0 }
  const totalRows = Math.ceil(items.length / cols)
  const firstRow = Math.max(0, Math.floor((scrollTop.value - BUFFER) / rowH))
  const lastRow = Math.min(totalRows, Math.ceil((scrollTop.value + viewH.value + BUFFER) / rowH))
  const first = Math.min(items.length, firstRow * cols)
  const last = Math.min(items.length, lastRow * cols)
  return {
    slice: items.slice(first, last),
    topPad: firstRow * rowH,
    bottomPad: Math.max(0, (totalRows - lastRow) * rowH)
  }
})

/* ── 触底自动加载（root = 滚动容器） ── */
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
function observeSentinel(): void {
  observer?.disconnect()
  observer = null
  if (!props.hasMore || !sentinel.value || !scrollEl.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && !props.loading) emit('load-more')
    },
    { root: scrollEl.value, rootMargin: '400px' }
  )
  observer.observe(sentinel.value)
}
watch(() => props.hasMore, observeSentinel)
onMounted(() => {
  // scrollEl 就绪后挂载 sentinel 观察（nextTick 等 DOM 更新）
  watch(
    () => [props.hasMore, scrollEl.value] as const,
    () => observeSentinel(),
    { flush: 'post' }
  )
  observeSentinel()
})
onUnmounted(() => observer?.disconnect())

// 加载完成后若底部仍处于可视区，继续加载下一页（IntersectionObserver 不会对持续相交重复触发）
watch(
  () => props.loading,
  (l) => {
    if (l || !props.hasMore || !sentinel.value || !scrollEl.value) return
    const r = sentinel.value.getBoundingClientRect()
    const root = scrollEl.value.getBoundingClientRect()
    if (r.top <= root.bottom + 400) emit('load-more')
  }
)
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <!-- 加载 / 空态 -->
    <div
      v-if="loading && items.length === 0"
      class="flex-1 flex items-center justify-center text-[var(--fg-dim)]"
    >
      加载中…
    </div>
    <div
      v-else-if="items.length === 0"
      class="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--fg-dim)]"
    >
      <Inbox :size="36" class="opacity-40" />
      <p class="text-sm">这里还没有内容</p>
      <p class="text-xs opacity-70">先在左侧活动栏配置扫描路径，然后执行扫描</p>
    </div>

    <!-- 滚动容器（虚拟化宿主） -->
    <div v-else ref="scrollEl" class="flex-1 min-h-0 overflow-y-auto" @scroll.passive="onScroll">
      <!-- 瀑布流：JS 列布局 + 绝对定位容器（ItemCard 自带 relative，须外包一层定位） -->
      <template v-if="isMasonry">
        <div class="relative" :style="{ height: layout.totalH + 'px', padding: PAD + 'px' }">
          <div
            v-for="p in visibleMasonry"
            :key="p.item.id"
            class="absolute"
            :style="{ left: p.left + 'px', top: p.top + 'px', width: p.width + 'px' }"
          >
            <ItemCard
              :item="p.item"
              :selected="selectedId != null && p.item.id === selectedId"
              @open="emit('open', $event)"
              @select="emit('select', $event)"
              @tag-click="emit('tag-click', $event)"
            />
          </div>
        </div>
        <div v-if="loading" class="flex justify-center py-2 text-[11px] text-[var(--fg-dim)]">
          加载中…
        </div>
        <div ref="sentinel" class="h-1" />
      </template>

      <!-- 网格 / 列表：均匀行，仅渲染可见行 -->
      <template v-else>
        <div :style="{ height: rowSlice.topPad + 'px' }" />
        <div
          v-if="uiStore.layoutMode === 'grid'"
          class="grid gap-3"
          :style="{
            gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
            padding: PAD + 'px'
          }"
        >
          <ItemCard
            v-for="item in rowSlice.slice"
            :key="item.id"
            :item="item"
            :selected="selectedId != null && item.id === selectedId"
            @open="emit('open', $event)"
            @select="emit('select', $event)"
            @tag-click="emit('tag-click', $event)"
          />
        </div>
        <div v-else class="flex flex-col gap-3" :style="{ padding: PAD + 'px' }">
          <ItemCard
            v-for="item in rowSlice.slice"
            :key="item.id"
            :item="item"
            :selected="selectedId != null && item.id === selectedId"
            @open="emit('open', $event)"
            @select="emit('select', $event)"
            @tag-click="emit('tag-click', $event)"
          />
        </div>
        <div :style="{ height: rowSlice.bottomPad + 'px' }" />
        <div v-if="loading" class="flex justify-center py-2 text-[11px] text-[var(--fg-dim)]">
          加载中…
        </div>
        <div ref="sentinel" class="h-1" />
      </template>
    </div>
  </div>
</template>
