<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { File as FileIcon, GripVertical, RefreshCw, Search, Tag as TagIcon, X } from 'lucide-vue-next'
import { useTabStore } from '../../stores/tab'
import { useItemStore } from '../../stores/item'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTagStore } from '../../stores/tag'
import { parseSearchInput } from '../../features/searchSyntax'
import { api } from '@shared/api'
import type { Id } from '@shared/contract'
import { closeSearchPopup, toggleSearchPopup, useSearchPopupState } from './searchPopup'

/**
 * 顶栏搜索簇（D44）：搜索图标钮 + 扫描图标钮 + 可拖拽的搜索弹出面板。
 * 搜索是横跨视图的动作，入口归顶栏（坐底板），面板按需弹出、可拖拽挪位（偏移仅本会话）；
 * 扫描 = 图标按钮，来源根缓存在 workspace store（挂载/卸载即失效）。
 * 显隐只做透明度过渡（P5）；无活动工作区时整簇禁用（item store 是全局单例，跨标签页无语义）。
 *
 * 输入建议（开发者定形）：词元补全 = 已声明标签（含 `-排除` 式），关键字补全 = 标题命中
 * （titleContains 全局检索，kinds:['file'] 与既有检索入口同款防幽灵锚条目）。
 * ↑↓ 选择、Enter 补全、Esc 先收建议再收面板；建议是筛选书写的增强，失败降级到仅标签候选。
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

// ── 输入建议 ──
interface Suggest {
  kind: 'tag' | 'title'
  /** 补全写进输入框的词元（不含 '-' 前缀，前缀按当前书写式回填）。 */
  label: string
  isExclude: boolean
  title: string
}
const suggests = ref<Suggest[]>([])
const suggestIndex = ref(0)

const lastToken = computed(() => {
  const tokens = itemStore.searchRaw.trim().split(/\s+/).filter((t) => t !== '')
  return tokens[tokens.length - 1] ?? ''
})

function tagSuggests(): Suggest[] {
  const token = lastToken.value
  const isExclude = token.startsWith('-')
  const q = token.slice(isExclude ? 1 : 0).toLowerCase()
  if (q === '') return []
  const out: Suggest[] = []
  for (const t of tagStore.allTags) {
    if (!declaredIds.value.has(t.id)) continue
    const name = t.name.toLowerCase()
    if (name.includes(q) && name !== q) {
      out.push({ kind: 'tag', label: t.name, isExclude, title: t.name })
      if (out.length >= 5) break
    }
  }
  return out
}

function applySuggests(list: Suggest[]): void {
  suggests.value = list
  suggestIndex.value = 0
}

let suggestSeq = 0
async function refreshSuggests(): Promise<void> {
  if (!opened.value || lastToken.value === '') {
    applySuggests([])
    return
  }
  const tags = tagSuggests()
  const token = lastToken.value
  if (token.startsWith('-')) {
    // 排除式只补全标签词元——`-标签` 是结构化筛选，标题不是排除对象
    applySuggests(tags)
    return
  }
  const seq = ++suggestSeq
  let titles: Suggest[] = []
  try {
    const hits = await api.items.query({ titleContains: token, limit: 5, kinds: ['file'] })
    if (seq !== suggestSeq) return
    titles = hits
      .filter((h) => h.item.kind === 'file' && h.item.title.toLowerCase() !== token.toLowerCase())
      .slice(0, 5)
      .map((h) => ({ kind: 'title' as const, label: h.item.title, isExclude: false, title: h.item.title }))
  } catch {
    // 建议是书写增强：检索失败降级为仅标签候选，不打断输入（条目查询本身另有失败可见性）
  }
  applySuggests([...tags, ...titles])
}

let suggestTimer: number | undefined
watch(
  () => itemStore.searchRaw,
  () => {
    window.clearTimeout(suggestTimer)
    suggestTimer = window.setTimeout(() => void refreshSuggests(), 150)
  }
)

function applySuggest(s: Suggest): void {
  const trimmed = itemStore.searchRaw.replace(/\s+$/, '')
  const idx = trimmed.lastIndexOf(' ')
  const head = idx >= 0 ? trimmed.slice(0, idx + 1) : ''
  itemStore.setSearchRaw(`${head}${s.isExclude ? '-' : ''}${s.label} `)
  inputRef.value?.focus()
}

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

/** 键盘：↑↓ 选建议、Enter 补全、Esc 先收建议再收面板。 */
function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown' && suggests.value.length > 0) {
    e.preventDefault()
    suggestIndex.value = (suggestIndex.value + 1) % suggests.value.length
  } else if (e.key === 'ArrowUp' && suggests.value.length > 0) {
    e.preventDefault()
    suggestIndex.value = (suggestIndex.value - 1 + suggests.value.length) % suggests.value.length
  } else if (e.key === 'Enter') {
    const s = suggests.value[suggestIndex.value]
    if (s != null) {
      e.preventDefault()
      applySuggest(s)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    if (suggests.value.length > 0) applySuggests([])
    else closeSearchPopup()
  }
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
      @click="toggleSearchPopup()"
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

  <!-- 搜索面板：一根长条（开发者定形）——左握持、中输入、右关闭；无占位提示词。
       浮层（P3 阴影例外）；默认锚 = 顶栏下方居中，拖拽偏移叠加其上；
       no-drag 必须显式：面板在 DOM 里是顶栏（drag-region）的后代，app-region 会继承。 -->
  <Transition name="popup-fade">
    <div
      v-if="opened"
      class="fixed top-12 left-1/2 -ml-40 z-40 w-80 no-drag flex items-center gap-1 px-1.5
             bg-[var(--bg-elev)] border border-[var(--border)] shadow-xl"
      :style="{ transform: `translate(${offset.x}px, ${offset.y}px)` }"
    >
      <GripVertical
        :size="14"
        class="p-1 -ml-1 text-[var(--fg-dim)] shrink-0 cursor-grab select-none"
        @pointerdown="onGripDown"
        @pointermove="onGripMove"
        @pointerup="onGripUp"
        @pointercancel="onGripUp"
      />
      <div class="relative flex-1 min-w-0">
        <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
        <input
          ref="inputRef"
          :value="itemStore.searchRaw"
          class="input pl-8 w-full"
          data-shortcut="search"
          @input="itemStore.setSearchRaw(($event.target as HTMLInputElement).value)"
          @focus="onInputFocus"
          @keydown="onInputKeydown"
        />
      </div>
      <button class="icon-btn w-5 h-5 shrink-0" title="关闭（Esc / Ctrl+F）" @click="closeSearchPopup">
        <X :size="13" />
      </button>

      <!-- 输入建议：标签词元补全 + 标题命中（面板带 transform，绝对定位锚定在面板上） -->
      <div
        v-if="suggests.length > 0"
        class="absolute top-full left-0 right-0 mt-1 py-1 bg-[var(--bg-elev)] border border-[var(--border)] shadow-lg"
      >
        <button
          v-for="(s, i) in suggests"
          :key="`${s.kind}:${s.title}`"
          class="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-[12px] cursor-pointer"
          :class="
            i === suggestIndex
              ? 'bg-[var(--bg-hover)] text-[var(--fg)]'
              : 'text-[var(--fg-dim)] hover:text-[var(--fg)] hover:bg-[var(--bg-hover)]'
          "
          @mouseenter="suggestIndex = i"
          @click="applySuggest(s)"
        >
          <TagIcon v-if="s.kind === 'tag'" :size="12" class="shrink-0" />
          <FileIcon v-else :size="12" class="shrink-0" />
          <span class="truncate">{{ s.isExclude ? `-${s.title}` : s.title }}</span>
        </button>
      </div>
    </div>
  </Transition>
</template>
