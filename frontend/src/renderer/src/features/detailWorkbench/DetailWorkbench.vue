<script setup lang="ts">
/**
 * 详情页工作台（D39）——槽位网格 + 槽内 tab 栈 + 槽间拖宽/拖高 + 跨槽拖放换位。
 *
 * 新实体（与 SurfaceHost 同哲学不同职能）：SurfaceHost 管"按挂载点的壳级外壳"，
 * 本组件管"详情页内的槽位与分配"——外壳归本组件（D22 容器归壳），视图只出内容、
 * 经上下文取数据（context.ts），每个视图 FeatureBoundary 错误隔离。
 *
 * 职责边界：布局规则是纯函数（slots.ts，有断言）；本组件只做装配、手势与持久化
 * （store.ts 持有布局，命令 detail.layoutReset 经它重置）。槽位集 v0 固定：
 * 左/中/右纵分，底横贯中列下方；空槽整槽不渲染。
 */
import { ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import type { ItemView } from '../../lib/viewModel'
import FeatureBoundary from '../FeatureBoundary.vue'
import {
  activateView,
  closeView,
  moveView,
  setSlotSize,
  type DetailSlotId,
  type SlotSizeKey
} from './slots'
import { getDetailView, knownViews, type DetailViewEntry } from './views'
import { commitLayout, initWorkbenchLayout, workbenchLayoutRef } from './store'
import { provideDetailWorkbenchContext } from './context'
import WbTabstrip from './WbTabstrip.vue'
import AddViewMenu from './AddViewMenu.vue'

const props = defineProps<{
  item: ItemView
  workspaceId: string | null
  editing: boolean
  windowViews: ItemView[]
  prev: ItemView | null
  next: ItemView | null
  go: (target: ItemView | null) => void
  toggleTag: (tagId: string) => Promise<void>
}>()

// 视图上下文：getter 包装 props（prop 变化即视图更新）
provideDetailWorkbenchContext({
  item: () => props.item,
  workspaceId: () => props.workspaceId,
  editing: () => props.editing,
  windowViews: () => props.windowViews,
  prev: () => props.prev,
  next: () => props.next,
  go: props.go,
  toggleTag: props.toggleTag
})

// 布局：挂载期解析（幂等）；翻页重挂组件时 config 已是最新，解析结果稳定
initWorkbenchLayout(knownViews())
const layout = workbenchLayoutRef()

const slotDef = (slot: DetailSlotId) => {
  const l = layout.value
  const tabs =
    l?.slots[slot]
      .map((id) => getDetailView(id))
      .filter((v): v is DetailViewEntry => v != null)
      .map((entry) => ({ entry, on: l.active[slot] === entry.id })) ?? []
  return { slot, tabs }
}

const activeEntry = (slot: DetailSlotId): DetailViewEntry | null => {
  const id = layout.value?.active[slot]
  return id != null ? getDetailView(id) : null
}

function activate(slot: DetailSlotId, viewId: string): void {
  const l = layout.value
  if (l == null) return
  commitLayout(activateView(l, slot, viewId))
}

function close(slot: DetailSlotId, viewId: string): void {
  const l = layout.value
  if (l == null) return
  commitLayout(closeView(l, viewId))
}

// ── 回添入口（D40）：菜单本体在 AddViewMenu（点选落位、安置即收回关闭记录）；
// 这里只持有"哪个槽的菜单开着"。全部关死时，中心空态的按钮是可靠归路。 ──
const openSlot = ref<DetailSlotId | null>(null)

function toggleAdd(slot: DetailSlotId): void {
  openSlot.value = openSlot.value === slot ? null : slot
}

// ── 跨槽拖放（HTML5 DnD，壳标签页同词汇）：拖 tab → 槽缘 accent 描边落点 → 松手换位 ──
const DRAG_MIME = 'application/x-taghit-detail-view'
const draggingId = ref<string | null>(null)
const dropSlot = ref<DetailSlotId | null>(null)

function onTabDragStart(viewId: string, e: DragEvent): void {
  draggingId.value = viewId
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_MIME, viewId)
    e.dataTransfer.setData('text/plain', viewId)
  }
}

function onTabDragEnd(): void {
  draggingId.value = null
  dropSlot.value = null
}

function onSlotDragOver(slot: DetailSlotId, e: DragEvent): void {
  if (draggingId.value == null || e.dataTransfer?.types.includes(DRAG_MIME) !== true) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  dropSlot.value = slot
}

function onSlotDragLeave(slot: DetailSlotId): void {
  if (dropSlot.value === slot) dropSlot.value = null
}

function onSlotDrop(slot: DetailSlotId, e: DragEvent): void {
  e.preventDefault()
  const viewId = e.dataTransfer?.getData(DRAG_MIME) ?? ''
  draggingId.value = null
  dropSlot.value = null
  const l = layout.value
  if (l == null || viewId === '') return
  commitLayout(moveView(l, viewId, slot))
}

// ── 槽间拖宽/拖高（指针捕获）：拖动中实时改几何零过渡，松手才持久化 ─────────────
interface SizeDrag {
  key: SlotSizeKey
  startPx: number
  startPos: number
  axis: 'x' | 'y'
  /** 1 = 位置增大即尺寸增大（左栏宽随右拖）；-1 = 位置减小即尺寸增大（右栏宽/底高随左/上拖）。 */
  sign: 1 | -1
}
let sizeDrag: SizeDrag | null = null

function onResizeDown(key: SlotSizeKey, axis: 'x' | 'y', sign: 1 | -1, e: PointerEvent): void {
  const l = layout.value
  if (l == null) return
  sizeDrag = {
    key,
    startPx: l.sizes[key],
    startPos: axis === 'x' ? e.clientX : e.clientY,
    axis,
    sign
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onResizeMove(e: PointerEvent): void {
  if (sizeDrag == null || layout.value == null) return
  const pos = sizeDrag.axis === 'x' ? e.clientX : e.clientY
  layout.value = setSlotSize(
    layout.value,
    sizeDrag.key,
    sizeDrag.startPx + sizeDrag.sign * (pos - sizeDrag.startPos)
  )
}

function onResizeUp(e: PointerEvent): void {
  if (sizeDrag == null || layout.value == null) return
  ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  sizeDrag = null
  commitLayout(layout.value) // 拖动全程只在松手时落一次库
}
</script>

<template>
  <div class="h-full flex min-h-0 min-w-0">
    <!-- 回添菜单的点击外关闭层 -->
    <div v-if="openSlot != null" class="fixed inset-0 z-10" @click="openSlot = null"></div>

    <!-- 左槽（空则整槽不渲染）：右侧拖宽手柄 -->
    <div
      v-if="slotDef('left').tabs.length"
      class="wb-slot relative shrink-0 h-full bg-[var(--bg-elev)] border-r border-[var(--border)] flex flex-col"
      :style="{ width: layout!.sizes.leftW + 'px' }"
      :data-drop="dropSlot === 'left' ? 'true' : 'false'"
      @dragover="onSlotDragOver('left', $event)"
      @dragleave="onSlotDragLeave('left')"
      @drop="onSlotDrop('left', $event)"
    >
      <WbTabstrip
        :tabs="slotDef('left').tabs"
        :dragging-id="draggingId"
        @activate="(id) => activate('left', id)"
        @close="(id) => close('left', id)"
        @add="toggleAdd('left')"
        @dragstart="(id, e) => onTabDragStart(id, e)"
        @dragend="onTabDragEnd"
      />
      <AddViewMenu v-if="openSlot === 'left'" to="left" anchor="below" @done="openSlot = null" />
      <div class="flex-1 min-h-0 relative overflow-hidden">
        <FeatureBoundary v-if="activeEntry('left')" :key="activeEntry('left')!.id" :label="activeEntry('left')!.title">
          <component :is="activeEntry('left')!.component" />
        </FeatureBoundary>
      </div>
      <div
        class="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[var(--accent-border)]"
        role="separator"
        aria-label="拖动调整左栏宽度"
        title="拖动调整栏宽"
        @pointerdown="onResizeDown('leftW', 'x', 1, $event)"
        @pointermove="onResizeMove"
        @pointerup="onResizeUp"
      ></div>
    </div>

    <!-- 左槽空态：窄条（D40——槽位是常驻结构，不随内容消失；保留落点与回添钮） -->
    <div
      v-else
      class="wb-slot relative shrink-0 h-full bg-[var(--bg-elev)] border-r border-[var(--border)] flex flex-col items-center pt-1.5"
      :style="{ width: '40px' }"
      :data-drop="dropSlot === 'left' ? 'true' : 'false'"
      @dragover="onSlotDragOver('left', $event)"
      @dragleave="onSlotDragLeave('left')"
      @drop="onSlotDrop('left', $event)"
    >
      <button class="icon-btn h-6 w-6" title="添加视图到左栏" @click="toggleAdd('left')">
        <Plus :size="13" />
      </button>
      <AddViewMenu v-if="openSlot === 'left'" to="left" anchor="below" @done="openSlot = null" />
    </div>

    <!-- 中列：中心槽（恒在）+ 底槽（空则不渲染） -->
    <div class="flex-1 min-w-0 h-full flex flex-col">
      <div
        class="flex-1 min-h-0 relative flex flex-col"
        :data-drop="dropSlot === 'center' ? 'true' : 'false'"
        @dragover="onSlotDragOver('center', $event)"
        @dragleave="onSlotDragLeave('center')"
        @drop="onSlotDrop('center', $event)"
      >
        <WbTabstrip
          v-if="slotDef('center').tabs.length"
          :tabs="slotDef('center').tabs"
          :dragging-id="draggingId"
          @activate="(id) => activate('center', id)"
          @close="(id) => close('center', id)"
          @add="toggleAdd('center')"
          @dragstart="(id, e) => onTabDragStart(id, e)"
          @dragend="onTabDragEnd"
        />
        <AddViewMenu v-if="openSlot === 'center'" to="center" anchor="below" @done="openSlot = null" />
        <!-- 预览台（带边缘的容器，D39/D37 落点）：插件的预览器经 detailPreview 认领后
             落进这个有界的面——预览器是一个"物件"，边缘宣告它的范围（P6 边框分职）；
             内衬留隙，不与邻槽接缝叠线。 -->
        <div v-if="activeEntry('center')" class="flex-1 min-h-0 relative p-2">
          <div class="h-full w-full relative overflow-hidden border border-[var(--border)]">
            <FeatureBoundary :key="activeEntry('center')!.id" :label="activeEntry('center')!.title">
              <component :is="activeEntry('center')!.component" />
            </FeatureBoundary>
          </div>
        </div>
        <div v-else class="flex-1 min-h-0 flex flex-col items-center justify-center gap-2">
          <span class="text-[12px] text-[var(--fg-dim)]">此槽为空</span>
          <button class="btn" @click="toggleAdd('center')">添加视图</button>
        </div>
      </div>

      <!-- 底槽：顶部拖高 -->
      <div
        v-if="slotDef('bottom').tabs.length"
        class="wb-slot relative shrink-0 bg-[var(--bg-elev)] border-t border-[var(--border)] flex flex-col"
        :style="{ height: layout!.sizes.bottomH + 'px' }"
        :data-drop="dropSlot === 'bottom' ? 'true' : 'false'"
        @dragover="onSlotDragOver('bottom', $event)"
        @dragleave="onSlotDragLeave('bottom')"
        @drop="onSlotDrop('bottom', $event)"
      >
        <WbTabstrip
          :tabs="slotDef('bottom').tabs"
          :dragging-id="draggingId"
          @activate="(id) => activate('bottom', id)"
          @close="(id) => close('bottom', id)"
          @add="toggleAdd('bottom')"
          @dragstart="(id, e) => onTabDragStart(id, e)"
          @dragend="onTabDragEnd"
        />
        <AddViewMenu v-if="openSlot === 'bottom'" to="bottom" anchor="above" @done="openSlot = null" />
        <div class="flex-1 min-h-0 relative overflow-hidden">
          <FeatureBoundary v-if="activeEntry('bottom')" :key="activeEntry('bottom')!.id" :label="activeEntry('bottom')!.title">
            <component :is="activeEntry('bottom')!.component" />
          </FeatureBoundary>
        </div>
        <div
          class="absolute top-0 left-0 z-10 w-full h-1 cursor-row-resize hover:bg-[var(--accent-border)]"
          role="separator"
          aria-label="拖动调整预览条高度"
          title="拖动调整高度"
          @pointerdown="onResizeDown('bottomH', 'y', -1, $event)"
          @pointermove="onResizeMove"
          @pointerup="onResizeUp"
        ></div>
      </div>

      <!-- 底槽空态：细条（D40——同左/右槽，结构常驻） -->
      <div
        v-else
        class="wb-slot relative shrink-0 h-9 bg-[var(--bg-elev)] border-t border-[var(--border)] flex items-center px-2"
        :data-drop="dropSlot === 'bottom' ? 'true' : 'false'"
        @dragover="onSlotDragOver('bottom', $event)"
        @dragleave="onSlotDragLeave('bottom')"
        @drop="onSlotDrop('bottom', $event)"
      >
        <span class="text-[11px] text-[var(--fg-dim)]">底栏</span>
        <button class="icon-btn h-6 w-6 ml-auto" title="添加视图到底栏" @click="toggleAdd('bottom')">
          <Plus :size="13" />
        </button>
        <AddViewMenu v-if="openSlot === 'bottom'" to="bottom" anchor="above" @done="openSlot = null" />
      </div>
    </div>

    <!-- 右槽：左侧拖宽手柄 -->
    <div
      v-if="slotDef('right').tabs.length"
      class="wb-slot relative shrink-0 h-full bg-[var(--bg-elev)] border-l border-[var(--border)] flex flex-col"
      :style="{ width: layout!.sizes.rightW + 'px' }"
      :data-drop="dropSlot === 'right' ? 'true' : 'false'"
      @dragover="onSlotDragOver('right', $event)"
      @dragleave="onSlotDragLeave('right')"
      @drop="onSlotDrop('right', $event)"
    >
      <WbTabstrip
        :tabs="slotDef('right').tabs"
        :dragging-id="draggingId"
        @activate="(id) => activate('right', id)"
        @close="(id) => close('right', id)"
        @add="toggleAdd('right')"
        @dragstart="(id, e) => onTabDragStart(id, e)"
        @dragend="onTabDragEnd"
      />
      <AddViewMenu v-if="openSlot === 'right'" to="right" anchor="below" @done="openSlot = null" />
      <div class="flex-1 min-h-0 relative overflow-hidden">
        <FeatureBoundary v-if="activeEntry('right')" :key="activeEntry('right')!.id" :label="activeEntry('right')!.title">
          <component :is="activeEntry('right')!.component" />
        </FeatureBoundary>
      </div>
      <div
        class="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[var(--accent-border)]"
        role="separator"
        aria-label="拖动调整右栏宽度"
        title="拖动调整栏宽"
        @pointerdown="onResizeDown('rightW', 'x', -1, $event)"
        @pointermove="onResizeMove"
        @pointerup="onResizeUp"
      ></div>
    </div>

    <!-- 右槽空态：窄条（D40——同左槽） -->
    <div
      v-else
      class="wb-slot relative shrink-0 h-full bg-[var(--bg-elev)] border-l border-[var(--border)] flex flex-col items-center pt-1.5"
      :style="{ width: '40px' }"
      :data-drop="dropSlot === 'right' ? 'true' : 'false'"
      @dragover="onSlotDragOver('right', $event)"
      @dragleave="onSlotDragLeave('right')"
      @drop="onSlotDrop('right', $event)"
    >
      <button class="icon-btn h-6 w-6" title="添加视图到右栏" @click="toggleAdd('right')">
        <Plus :size="13" />
      </button>
      <AddViewMenu v-if="openSlot === 'right'" to="right" anchor="below" @done="openSlot = null" />
    </div>
  </div>
</template>
