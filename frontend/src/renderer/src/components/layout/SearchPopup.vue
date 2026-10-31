<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { GripVertical, RefreshCw, Search, X } from 'lucide-vue-next'
import { useTabStore } from '../../stores/tab'
import { useItemStore } from '../../stores/item'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTagStore } from '../../stores/tag'
import { parseSearchInput } from '../../features/searchSyntax'
import { api } from '@shared/api'
import type { Id } from '@shared/contract'
import { closeSearchPopup, openSearchPopup, useSearchPopupState } from './searchPopup'

/**
 * 顶栏搜索簇（D44）：搜索图标钮 + 扫描图标钮 + 可拖拽的搜索弹出面板。
 * 搜索是横跨视图的动作，入口归顶栏（坐底板），面板按需弹出、可拖拽挪位（偏移仅本会话）；
 * 扫描 = 图标按钮，来源根缓存在 workspace store（挂载/卸载即失效）。
 * 显隐只做透明度过渡（P5）；无活动工作区时整簇禁用（item store 是全局单例，跨标签页无语义）。
 */
const tabStore = useTabStore()
const itemStore = useItemStore()
const workspaceStore = useWorkspaceStore()
const tagStore = useTagStore()
const opened = useSearchPopupState()

const activeWsId = computed(() => tabStore.activeWorkspaceId)
const inputRef = ref<HTMLInputElement | null>(null)

// ── hasPaths：读 store 的来源根缓存（单点真相），ensureRoots 缺才补拉 ──
const hasPaths = computed(
  () => activeWsId.value != null && workspaceStore.rootsOf(activeWsId.value).length > 0
)

async function refreshRoots(): Promise<void> {
  if (activeWsId.value != null) await workspaceStore.ensureRoots(activeWsId.value)
}
watch([activeWsId, () => workspaceStore.rootsVersion], refreshRoots)
onMounted(() => void refreshRoots())

// ── 搜索解析（自 SearchBar 迁移，语义不变）：词元留在栏里即筛选态，改字即改筛选 ──
const declaredIds = ref<Set<string>>(new Set())
async function refreshDeclared(): Promise<void> {
  if (activeWsId.value == null) return
  await tagStore.refreshAll()
  declaredIds.value = new Set(await api.workspaces.declaredTags(activeWsId.value))
}

const nameToId = computed(() => {
  const m = new Map<string, string>()
  if (activeWsId.value == null) return m
  for (const t of tagStore.allTags) {
    if (declaredIds.value.has(t.id)) m.set(t.name.toLowerCase(), t.id)
  }
  return m
})
const parsed = computed(() => parseSearchInput(itemStore.searchRaw, nameToId.value))

function sameIds(a: Id[], b: Id[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}
watch(parsed, (p) => {
  const cur = itemStore.filter
  if (
    p.keyword !== cur.keyword ||
    !sameIds(p.requiredTagIds, cur.tagIds) ||
    !sameIds(p.excludedTagIds, cur.excludedTagIds)
  ) {
    itemStore.setSearch(p.keyword, p.requiredTagIds, p.excludedTagIds)
  }
})

// ── 开合：打开即聚焦全选；活动工作区消失即收起（搜索是工作区作用域的动作） ──
watch(opened, async (o) => {
  if (!o) return
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})
watch(activeWsId, (id) => {
  if (id == null && opened.value) closeSearchPopup()
})

function onInputFocus(): void {
  void refreshDeclared()
}

// ── 扫描 ──
function onScan(): void {
  if (itemStore.scanning || activeWsId.value == null || !hasPaths.value) return
  void itemStore.scan(activeWsId.value)
}

// ── 拖拽：头部握持 + pointer capture，偏移几何走 :style（数据） ──
const offset = ref({ x: 0, y: 0 })
let drag: { px: number; py: number; ox: number; oy: number } | null = null

function onGripDown(e: PointerEvent): void {
  drag = { px: e.clientX, py: e.clientY, ox: offset.value.x, oy: offset.value.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onGripMove(e: PointerEvent): void {
  if (drag == null) return
  offset.value = { x: drag.ox + (e.clientX - drag.px), y: drag.oy + (e.clientY - drag.py) }
}
function onGripUp(): void {
  drag = null
}
</script>

<template>
  <!-- 顶栏簇（设置键左侧）：顶栏是拖拽区，交互元素必须挂在 no-drag 容器内 -->
  <div class="flex items-center gap-1 shrink-0 no-drag">
    <button
      class="icon-btn w-8 h-8"
      :class="opened ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : ''"
      :disabled="activeWsId == null"
      :title="activeWsId == null ? '搜索（工作区标签页可用，Ctrl+F）' : '搜索（Ctrl+F）'"
      @click="opened ? closeSearchPopup() : openSearchPopup()"
    >
      <Search :size="16" />
    </button>
    <button
      class="icon-btn w-8 h-8"
      :disabled="itemStore.scanning || activeWsId == null || !hasPaths"
      :title="hasPaths ? '扫描（目录变更后自动触发）' : '未配置路径，请在左侧「来源根」添加'"
      @click="onScan"
    >
      <RefreshCw :size="15" :class="{ 'animate-spin': itemStore.scanning }" />
    </button>
  </div>

  <!-- 搜索面板：浮层（P3 阴影例外）；默认锚 = 顶栏下方居中，拖拽偏移叠加其上。
       no-drag 必须显式：面板在 DOM 里是顶栏（drag-region）的后代，app-region 会继承。 -->
  <Transition name="popup-fade">
    <div
      v-if="opened"
      class="fixed top-12 left-1/2 -ml-40 z-40 w-80 no-drag bg-[var(--bg-elev)] border border-[var(--border)] shadow-xl"
      :style="{ transform: `translate(${offset.x}px, ${offset.y}px)` }"
    >
      <div
        class="flex items-center gap-1 px-2 h-8 border-b border-[var(--border-soft)] cursor-grab select-none"
        @pointerdown="onGripDown"
        @pointermove="onGripMove"
        @pointerup="onGripUp"
        @pointercancel="onGripUp"
      >
        <GripVertical :size="12" class="text-[var(--fg-dim)] shrink-0" />
        <span class="text-[11px] text-[var(--fg-dim)] flex-1">搜索</span>
        <button class="icon-btn w-4 h-4" title="关闭（Esc）" @click="closeSearchPopup">
          <X :size="12" />
        </button>
      </div>
      <div class="relative m-2">
        <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
        <input
          ref="inputRef"
          :value="itemStore.searchRaw"
          class="input pl-8 w-full"
          placeholder="搜索文件名或标签（-标签 排除）"
          data-shortcut="search"
          @input="itemStore.setSearchRaw(($event.target as HTMLInputElement).value)"
          @focus="onInputFocus"
          @keydown.esc.stop.prevent="closeSearchPopup"
        />
      </div>
    </div>
  </Transition>
</template>
