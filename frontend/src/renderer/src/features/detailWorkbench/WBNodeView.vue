<script setup lang="ts">
/**
 * 工作台树节点（D41，按文件名自递归）：
 * - 叶 = 槽：tab 条（WbTabstrip）+ 视图（FeatureBoundary 隔离）+ 空态（回添/关闭此槽）
 *   + 四缘落点区（仅拖拽中出现——拖到缘 = 在该缘分割新槽，缘内 = 并入此槽）；
 * - 枝 = 分割：flex 排布子节点，兄弟之间 1px 缝线（.wb-seam，即槽与槽之间的边缘）
 *   兼作拖宽/拖高柄（拖动中权重实时生效、松手才落库）。
 * 布局规则在 slots.ts（纯模块，有断言）；本组件只装配与手势。
 */
import { computed, ref } from 'vue'
import type { SplitDir, WBLeaf, WBNode, WBSplit } from './slots'
import { getDetailView, type DetailViewEntry } from './views'
import { useWorkbenchApi } from './api'
import WbTabstrip from './WbTabstrip.vue'
import FeatureBoundary from '../FeatureBoundary.vue'

const props = defineProps<{ node: WBNode }>()
const api = useWorkbenchApi()

const dragging = computed(() => api.draggingId.value)
const isSplit = computed(() => props.node.kind === 'split')
const split = computed(() => (isSplit.value ? (props.node as WBSplit) : null))
const leaf = computed(() => (props.node.kind === 'leaf' ? (props.node as WBLeaf) : null))

// ── 叶 ────────────────────────────────────────────────────────────────────────
const tabs = computed(() => {
  const l = leaf.value
  if (l == null) return []
  return l.stack
    .map((id) => getDetailView(id))
    .filter((v): v is DetailViewEntry => v != null)
    .map((entry) => ({ entry, on: l.active === entry.id }))
})
const active = computed(() => {
  const l = leaf.value
  if (l == null || l.active == null) return null
  return getDetailView(l.active)
})

const EDGE_ZONES: Array<{ dir: SplitDir; cls: string }> = [
  { dir: 'above', cls: 'top-0 left-0 right-0 h-7' },
  { dir: 'below', cls: 'bottom-0 left-0 right-0 h-7' },
  { dir: 'left', cls: 'left-0 top-0 bottom-0 w-7' },
  { dir: 'right', cls: 'right-0 top-0 bottom-0 w-7' }
]
const hoverEdge = ref<SplitDir | null>(null)

function onBodyOver(e: DragEvent): void {
  if (!api.isWorkbenchDrag(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onBodyDrop(): void {
  const viewId = api.draggingId.value
  if (viewId == null) return
  api.addToLeaf(viewId, props.node.id)
}

function onEdgeDrop(dir: SplitDir): void {
  const viewId = api.draggingId.value ?? undefined
  hoverEdge.value = null
  api.splitLeaf(props.node.id, dir, viewId)
}

// ── 枝（权重拖拽：拖动中走本地草稿实时生效，松手提交） ─────────────────────────
const draftWeights = ref<number[] | null>(null)
const weights = computed(() =>
  draftWeights.value ?? (split.value?.weights ?? [])
)
interface WeightDrag {
  index: number
  startPos: number
  axisSize: number
  start: number[]
  dir: 'row' | 'col'
}
let weightDrag: WeightDrag | null = null
/** 拖拽中的缝索引（ref 供模板渲染 accent 常亮态；weightDrag 是非响应式手势数据）。 */
const resizingIndex = ref<number | null>(null)

function onResizeDown(index: number, e: PointerEvent): void {
  const s = split.value
  if (s == null) return
  const el = (e.currentTarget as HTMLElement).parentElement
  if (el == null) return
  const rect = el.getBoundingClientRect()
  weightDrag = {
    index,
    startPos: s.dir === 'row' ? e.clientX : e.clientY,
    axisSize: s.dir === 'row' ? rect.width : rect.height,
    start: [...s.weights],
    dir: s.dir
  }
  resizingIndex.value = index
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onResizeMove(e: PointerEvent): void {
  if (weightDrag == null) return
  const pos = weightDrag.dir === 'row' ? e.clientX : e.clientY
  const sum = weightDrag.start.reduce((a, b) => a + b, 0)
  const delta = ((pos - weightDrag.startPos) / weightDrag.axisSize) * sum
  const w = [...weightDrag.start]
  let a = w[weightDrag.index]! + delta
  let b = w[weightDrag.index + 1]! - delta
  if (a < 0.05) {
    b -= 0.05 - a
    a = 0.05
  }
  if (b < 0.05) {
    a -= 0.05 - b
    b = 0.05
  }
  if (a < 0.05 || b < 0.05) return
  w[weightDrag.index] = a
  w[weightDrag.index + 1] = b
  draftWeights.value = w
}

function onResizeUp(e: PointerEvent): void {
  if (weightDrag == null) return
  ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  const s = split.value
  if (s != null && draftWeights.value != null) {
    api.commitWeights(s.id, draftWeights.value)
  }
  draftWeights.value = null
  weightDrag = null
  resizingIndex.value = null
}
</script>

<template>
  <!-- 叶（槽位卡片：附在底板上，--bg-elev 浅一档） -->
  <div
    v-if="leaf"
    class="h-full w-full relative flex flex-col min-w-0 min-h-0 overflow-hidden bg-[var(--bg-elev)]"
    @dragover="onBodyOver"
    @drop.prevent="onBodyDrop"
  >
    <WbTabstrip
      :tabs="tabs"
      :dragging-id="dragging"
      @activate="(id) => api.activate(props.node.id, id)"
      @close="(id) => api.closeView(id)"
      @add="(e) => api.openMenu(props.node.id, e)"
      @dragstart="(id, e) => api.startDrag(id, e)"
      @dragend="api.endDrag()"
    />
    <div v-if="active" class="flex-1 min-h-0 relative overflow-hidden">
      <FeatureBoundary :key="active.id" :label="active.title">
        <component :is="active.component" />
      </FeatureBoundary>
    </div>
    <div v-else class="flex-1 min-h-0 flex flex-col items-center justify-center gap-2">
      <span class="text-[12px] text-[var(--fg-dim)]">空槽</span>
      <button class="btn" @click="api.closeLeaf(props.node.id)">关闭此槽</button>
    </div>

    <!-- 四缘落点区（仅拖拽中出现；拖到缘 = 分割，dragover.stop 防止误触叶体并入） -->
    <template v-if="dragging">
      <div
        v-for="edge in EDGE_ZONES"
        :key="edge.dir"
        class="wb-edge absolute z-20"
        :class="edge.cls"
        :data-on="hoverEdge === edge.dir ? 'true' : 'false'"
        @dragover.prevent.stop="hoverEdge = edge.dir"
        @dragleave="hoverEdge = null"
        @drop.prevent.stop="onEdgeDrop(edge.dir)"
      />
    </template>
  </div>

  <!-- 枝（分割容器自身是底板的一部分：缝隙处露出最深底色） -->
  <div
    v-else-if="split"
    class="h-full w-full flex min-h-0 min-w-0 bg-[var(--bg)]"
    :class="split.dir === 'row' ? 'flex-row' : 'flex-col'"
  >
    <template v-for="(child, i) in split.children" :key="child.id">
      <div class="flex min-w-0 min-h-0" :style="{ flex: `${weights[i]} 1 0%` }">
        <WBNodeView :node="child" class="flex-1 min-w-0 min-h-0" />
      </div>
      <div
        v-if="i < split.children.length - 1"
        class="wb-seam shrink-0"
        :class="split.dir === 'row' ? 'wb-seam--x' : 'wb-seam--y'"
        :data-drag="resizingIndex === i ? 'true' : 'false'"
        :aria-label="split.dir === 'row' ? '拖动调整槽位宽度' : '拖动调整槽位高度'"
        @pointerdown="onResizeDown(i, $event)"
        @pointermove="onResizeMove"
        @pointerup="onResizeUp"
      ></div>
    </template>
  </div>
</template>
