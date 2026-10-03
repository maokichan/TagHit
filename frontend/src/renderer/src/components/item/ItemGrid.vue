<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Inbox } from 'lucide-vue-next'
import type { ItemView } from '../../lib/viewModel'
import { masonryRatioOf } from '../../lib/media'
import { useConfigStore } from '../../stores/config'
import { isBlankClick, marqueeIntentOf, type MarqueeIntent, type SelectIntent } from '../../features/selection'
import { collectCardRects, hitIds, isDragGesture, rectBetween, type Rect } from '../../features/marquee'
import type { LayoutMode } from '@shared/types/config'
import ItemCard from './ItemCard.vue'

const props = defineProps<{
  items: ItemView[]
  loading: boolean
  interactiveTags?: boolean
  selectedId?: string | null
  /** 多选集（Ctrl/Cmd+单击聚合；勾选角标依据） */
  selectedIds?: string[]
  hasMore?: boolean
}>()
const emit = defineEmits<{
  (e: 'open', item: ItemView): void
  (e: 'pick', item: ItemView, intent: SelectIntent): void
  (e: 'blank'): void
  /** 框选结果：命中 id 集 + 意图（replace/add 由壳的选择模型解释）。 */
  (e: 'marquee', ids: string[], intent: MarqueeIntent): void
  (e: 'tag-click', tagId: string): void
  (e: 'load-more'): void
}>()
const config = useConfigStore()

function isSelected(id: string): boolean {
  return props.selectedId === id || (props.selectedIds?.includes(id) ?? false)
}

/**
 * 空白点击 → 清空选择（键鼠框架边界点之一）。
 * 判定与右键菜单共用同一份 DOM 契约：命中 `[data-ctx-target]`（条目卡片）= 非空白。
 */
function onContainerClick(e: MouseEvent): void {
  // 刚做完一次框选：紧随其后的 click 不该再清空（否则"框完就没了"）。
  // 标志位由下一次 mousedown 复位，而不是"消费一次"——鼠标在容器外抬起时那次 click 根本不出现，
  // 消费式标志会留下一个假的抑制态，表现为"点空白清不掉选择"。
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (isBlankClick(e)) emit('blank')
}

/* ── 框选（拖拽多选，D35）──────────────────────────────────────────────
 * 分工：手势在这里（要容器与几何），**意图解释归壳**（selection.marqueeIntentOf），
 * **状态变更归 store**（setSelection）——组件不自己改多选集。
 * 只在**空白处**起手：卡片上按下是"选择/拖出"手势（拖出由壳根部拦截，见 features/drag.ts）。
 * 坐标一律视口坐标（见 features/marquee.ts 的说明），覆盖层用 position:fixed 直出。
 * 阈值：超过 4px 才算框选，免得裸点击（点空白清空选择）被手抖变成一次框选。 */
const marquee = ref<Rect | null>(null)
let dragStart: { x: number; y: number; intent: MarqueeIntent } | null = null
let suppressClick = false

function onContainerMouseDown(e: MouseEvent): void {
  suppressClick = false // 每次新手势都从干净状态开始（见 onContainerClick 的说明）
  if (e.button !== 0) return
  if (!isBlankClick(e)) return
  // 滚动条不算"空白"：在它上面 preventDefault 会把"拖动滚动条"一起掐掉
  const el = scrollEl.value
  if (el != null && e.target === el && (e.offsetX >= el.clientWidth || e.offsetY >= el.clientHeight)) {
    return
  }
  e.preventDefault() // 抑制文本选择（拖框时满屏选字）；不影响随后的 click 事件
  // 意图在**按下瞬间**定型：中途再按/松开 Ctrl 不改语义，避免"边拖边变"
  dragStart = { x: e.clientX, y: e.clientY, intent: marqueeIntentOf(e) }
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
}

function onWindowMouseMove(e: MouseEvent): void {
  const start = dragStart
  if (start == null) return
  // 鼠标在窗口外抬起时收不到 mouseup：以"没有按键按下"为准收场，避免框选矩形跟着光标乱跑
  if (e.buttons === 0) {
    onWindowMouseUp()
    return
  }
  const dx = e.clientX - start.x
  const dy = e.clientY - start.y
  // 未过阈值前仍算"点了一下"（裸点击 = 点空白清空选择），过了就一次算到底
  if (marquee.value == null && !isDragGesture(dx, dy)) return
  marquee.value = rectBetween(start.x, start.y, e.clientX, e.clientY)
}

function onWindowMouseUp(): void {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  const start = dragStart
  const box = marquee.value
  dragStart = null
  marquee.value = null
  const container = scrollEl.value
  if (start == null || box == null || container == null) return
  suppressClick = true
  emit('marquee', hitIds(box, collectCardRects(container)), start.intent)
}

/* ── 布局常量（与 ItemCard 保持一致） ── */
const PAD = 12 // p-3
const GAP = 12 // gap-3
const MIN_COL = 180
const INFO_H = 56 // ItemCard 信息区固定高度（标题+标签一行）
const LIST_ROW_H = 64 // 列表行高（缩略图 48 + py-2×2），与 ItemCard 行样式一致
const LIST_GAP = 4 // 列表行距（紧凑，区别于网格/瀑布流的 GAP）
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
  // 框选手势挂在 window 上（拖出网格也不断线），卸载时必须收回
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
})

/* ── 布局计算：瀑布流 = JS 列分配（追加不动旧卡片）；网格/列表 = 均匀行 ──
 * 比值经 lib/media.masonryRatioOf：只取扫描实测 width/height（钳制 [1/2.2, 2.2]），
 * 缺失 → 中性 4:3 占位（D26：contentHash 假比例已被裁定为缺陷源，勿回退）。 */
function ratioOf(item: ItemView): number {
  return masonryRatioOf(item)
}

const isMasonry = computed(() => config.value<LayoutMode>('layout', 'layoutMode', 'masonry') === 'masonry')
const isListMode = computed(() => config.value<LayoutMode>('layout', 'layoutMode', 'masonry') === 'list')
const isGridMode = computed(() => config.value<LayoutMode>('layout', 'layoutMode', 'masonry') === 'grid')
const showTitles = computed(() => config.value('showTitles', 'showTitles', true))

interface LayoutResult {
  places: { item: ItemView; left: number; top: number; width: number; height: number }[]
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
  const infoH = showTitles.value ? INFO_H : 0

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

  // 列表：单列固定行高（文件管理器样式），虚拟化按 1 列行进，与渲染列数一致
  if (isListMode.value) {
    const rowH = LIST_ROW_H + LIST_GAP
    const totalRows = items.length
    return {
      places: [],
      totalH: Math.max(0, totalRows * rowH - LIST_GAP + PAD),
      cols: 1,
      colW: 0,
      cardH: 0,
      rowH
    }
  }

  // 网格：均匀单元高度（media 4:3 + 信息区），行切片虚拟化
  const mediaW = colW
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
  if (rowH <= 0 || items.length === 0) return { slice: [] as ItemView[], topPad: 0, bottomPad: 0 }
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
    <div
      v-else
      ref="scrollEl"
      class="flex-1 min-h-0 overflow-y-auto select-none"
      @scroll.passive="onScroll"
      @click="onContainerClick"
      @mousedown="onContainerMouseDown"
    >
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
              :selected="isSelected(p.item.id)"
              @open="emit('open', $event)"
              @pick="(item, intent) => emit('pick', item, intent)"
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
          v-if="isGridMode"
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
            :selected="isSelected(item.id)"
            @open="emit('open', $event)"
              @pick="(item, intent) => emit('pick', item, intent)"
            @tag-click="emit('tag-click', $event)"
          />
        </div>
        <div
          v-else
          class="flex flex-col"
          :style="{ padding: PAD + 'px', gap: LIST_GAP + 'px' }"
        >
          <ItemCard
            v-for="item in rowSlice.slice"
            :key="item.id"
            :item="item"
            :selected="isSelected(item.id)"
            @open="emit('open', $event)"
              @pick="(item, intent) => emit('pick', item, intent)"
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

    <!-- 框选覆盖层（视口坐标直出；pointer-events-none 免得挡住鼠标事件） -->
    <div
      v-if="marquee"
      class="fixed z-30 pointer-events-none rounded-sm border border-[var(--accent)]"
      style="background: color-mix(in srgb, var(--accent) 14%, transparent)"
      :style="{
        left: marquee.x + 'px',
        top: marquee.y + 'px',
        width: marquee.w + 'px',
        height: marquee.h + 'px'
      }"
    />
  </div>
</template>
