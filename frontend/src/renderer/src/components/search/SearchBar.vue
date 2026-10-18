<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshCw, Search, X } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTagStore } from '../../stores/tag'
import { parseSearchInput } from '../../features/searchSyntax'
import { api } from '@shared/api'
import type { Id, Tag } from '@shared/contract'

const props = defineProps<{ workspaceId: Id }>()
const itemStore = useItemStore()
const workspaceStore = useWorkspaceStore()
const tagStore = useTagStore()

const rootCount = ref(0)
const hasPaths = computed(() => rootCount.value > 0)

async function refreshRoots(): Promise<void> {
  rootCount.value = (await workspaceStore.listRoots(props.workspaceId)).length
}

/**
 * 标签候选 = **本工作区已声明**的标签（筛选语义与声明投影一致）。
 * 不经全局 tag store 的"当前工作区"游标——详情页/其他面板可能把它刷成别的库；
 * 声明/新建发生在同视图的面板侧，故**聚焦即重取**（两次轻读，保证候选不陈旧）。
 */
const declaredIds = ref<Set<string>>(new Set())
async function refreshDeclared(): Promise<void> {
  await tagStore.refreshAll()
  declaredIds.value = new Set(await api.workspaces.declaredTags(props.workspaceId))
}

/**
 * 搜索词法（features/searchSyntax）：输入是唯一书写处，`-标签名` 词元 = 排除。
 * 解析在输入侧、语义落 store（setSearch 成对写入关键字与排除集）——
 * 差异判断避免每次键入都写 store（写会触发视图重查）。
 */
const raw = ref(itemStore.filter.keyword)
const nameToId = computed(() => {
  const m = new Map<string, string>()
  for (const t of tagStore.allTags) {
    if (declaredIds.value.has(t.id)) m.set(t.name.toLowerCase(), t.id)
  }
  return m
})
const parsed = computed(() => parseSearchInput(raw.value, nameToId.value))

function sameIds(a: Id[], b: Id[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}
watch(parsed, (p) => {
  const cur = itemStore.filter
  if (p.keyword !== cur.keyword || !sameIds(p.excludedTagIds, cur.excludedTagIds)) {
    itemStore.setSearch(p.keyword, p.excludedTagIds)
  }
})

const inputFocused = ref(false)
const highlight = ref(0)
/** 候选查询：排除模式（末位悬置 `-前缀`）按它匹配，否则按关键字——两种模式互斥。 */
const candidateQuery = computed(() => (parsed.value.pendingExclude ?? parsed.value.keyword).trim().toLowerCase())
const excludeMode = computed(() => parsed.value.pendingExclude != null)
const candidates = computed(() => {
  const q = candidateQuery.value
  if (q === '') return []
  const active = excludeMode.value ? itemStore.filter.excludedTagIds : itemStore.filter.tagIds
  return tagStore.allTags
    .filter(
      (t) => declaredIds.value.has(t.id) && !active.includes(t.id) && t.name.toLowerCase().includes(q)
    )
    .slice(0, 8)
})
const showCandidates = computed(() => inputFocused.value && candidates.value.length > 0)

/** 排除模式：把悬置词元收起成 `-全名`；普通模式：加入标签筛选并清空输入（既有行为）。 */
function applyCandidate(tag: Tag): void {
  if (excludeMode.value) {
    const pending = parsed.value.pendingExclude!
    const idx = raw.value.toLowerCase().lastIndexOf(`-${pending.toLowerCase()}`)
    raw.value = (idx >= 0 ? raw.value.slice(0, idx) : raw.value) + `-${tag.name} `
    return
  }
  itemStore.toggleTagFilter(tag.id)
  raw.value = ''
}

function onInputKeydown(e: KeyboardEvent): void {
  if (!showCandidates.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlight.value = (highlight.value + 1) % candidates.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlight.value = (highlight.value - 1 + candidates.value.length) % candidates.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const tag = candidates.value[highlight.value] ?? candidates.value[0]
    if (tag != null) applyCandidate(tag)
  }
}

watch(candidates, () => {
  highlight.value = 0
})

function onInputFocus(): void {
  inputFocused.value = true
  void refreshDeclared()
}

/** 当前按标签筛选的标签名列表（用于展示筛选状态，可单独/全部清除） */
const activeTagFilters = computed(() =>
  itemStore.filter.tagIds
    .map((id) => tagStore.allTags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t != null)
)
/** 排除中的标签（`-词元` 解析结果）：chip 展示；摘除 = 从输入里摘词元（输入是唯一书写处）。 */
const activeExcluded = computed(() =>
  itemStore.filter.excludedTagIds
    .map((id) => tagStore.allTags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t != null)
)

function removeExclusion(tag: Tag): void {
  raw.value = raw.value
    .split(/\s+/)
    .filter((tok) => {
      if (!tok.startsWith('-') || tok.length < 2) return true
      return tok.slice(1).toLowerCase() !== tag.name.toLowerCase()
    })
    .join(' ')
}

function clearAllFilters(): void {
  itemStore.clearTagFilters()
  // 排除词元也住在输入里，一并清掉（只清 store 会被下一次解析写回）
  raw.value = ''
}

onMounted(() => {
  void tagStore.refreshAll()
  void refreshRoots()
  void refreshDeclared().then(() => {
    // 把 store 里已有的排除标签还原成词元（从详情页返回时输入框要"接得上"既有筛选）
    const missing = itemStore.filter.excludedTagIds
      .map((id) => tagStore.allTags.find((t) => t.id === id)?.name)
      .filter((n): n is string => n != null)
      .filter((n) => !raw.value.toLowerCase().includes(`-${n.toLowerCase()}`))
    if (missing.length > 0) {
      raw.value = [...raw.value.trim().split(/\s+/).filter((t) => t !== ''), ...missing.map((n) => `-${n}`)].join(' ')
    }
  })
})
watch(() => props.workspaceId, () => void refreshDeclared())

function onScan(): void {
  if (itemStore.scanning || !hasPaths.value) return
  void itemStore.scan(props.workspaceId)
}
</script>

<template>
  <div class="px-3 py-2 border-b border-[var(--border)] space-y-1.5">
    <div class="flex items-center gap-2">
      <div class="relative w-[400px] shrink-0">
        <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
        <input
          v-model="raw"
          class="input pl-8 w-full"
          placeholder="搜索文件名或标签（-标签 排除）"
          data-shortcut="search"
          @focus="onInputFocus"
          @blur="inputFocused = false"
          @keydown="onInputKeydown"
        />
        <!-- 标签候选：输入即浮出，点选/回车生效（↑↓ 选择）。
             排除模式（末位悬置 `-前缀`）下候选点选收起为 `-全名` 词元。 -->
        <div
          v-if="showCandidates"
          class="absolute top-full left-0 right-0 mt-1 z-20 bg-[var(--bg-elev)] border border-[var(--border)] rounded-md shadow-lg overflow-hidden"
        >
          <button
            v-for="(tag, i) in candidates"
            :key="tag.id"
            type="button"
            class="w-full text-left px-3 py-1.5 text-[12px] cursor-pointer"
            :class="i === highlight ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : ''"
            :title="tag.description ?? ''"
            @mousedown.prevent="applyCandidate(tag)"
            @mouseenter="highlight = i"
          >
            <template v-if="excludeMode">不含：</template>{{ tag.name }}
          </button>
        </div>
      </div>

      <!-- 间隔区：把扫描按钮推到搜索栏最右侧 -->
      <div class="flex-1" />

      <!-- 计数：total 为成员总数（不受排序/分页影响），已显示 = 当前已渲染条数 -->
      <span
        class="text-[11px] text-[var(--fg-dim)] shrink-0 tabular-nums"
        :title="`成员总数 ${itemStore.total}；当前已渲染 ${itemStore.items.length}`"
      >
        <template v-if="itemStore.items.length < itemStore.total">
          已显示 {{ itemStore.items.length }} / 共 {{ itemStore.total }} 项
        </template>
        <template v-else>共 {{ itemStore.total }} 项</template>
      </span>

      <button
        class="btn btn-primary shrink-0 ml-2"
        :disabled="itemStore.scanning || !hasPaths"
        :title="hasPaths ? '扫描（目录变更后自动触发）' : '未配置路径，请在左侧活动栏添加'"
        @click="onScan"
      >
        <RefreshCw :size="14" :class="{ 'animate-spin': itemStore.scanning }" />
        {{ itemStore.scanning ? '扫描中…' : '扫描' }}
      </button>
    </div>

    <!-- 标签筛选状态：chip 本身即筛选态（点 X 取消）。必须含有（solid）与排除（danger）两态并排。 -->
    <div v-if="activeTagFilters.length || activeExcluded.length" class="flex items-center gap-1.5 flex-wrap">
      <button
        v-for="tag in activeTagFilters"
        :key="tag.id"
        class="chip chip--solid gap-1 px-2"
        :title="`取消筛选 ${tag.name}`"
        @click="itemStore.toggleTagFilter(tag.id)"
      >
        {{ tag.name }} <X :size="10" />
      </button>
      <button
        v-for="tag in activeExcluded"
        :key="`ex-${tag.id}`"
        class="chip chip--excluded gap-1 px-2"
        :title="`取消排除 ${tag.name}`"
        @click="removeExclusion(tag)"
      >
        不含 {{ tag.name }} <X :size="10" />
      </button>
      <button
        class="text-[11px] text-[var(--fg-dim)] hover:text-[var(--danger)] cursor-pointer underline"
        title="清除全部标签筛选"
        @click="clearAllFilters"
      >
        清除全部
      </button>
    </div>
  </div>
</template>
