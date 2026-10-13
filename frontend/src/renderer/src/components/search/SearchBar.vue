<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshCw, Search, X } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTagStore } from '../../stores/tag'
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
 * 本地取数不经全局 tag store 的"当前工作区"游标——详情页/其他面板可能把它刷成别的库。
 */
const declaredTags = ref<Tag[]>([])
async function refreshDeclared(): Promise<void> {
  const ids = new Set(await api.workspaces.declaredTags(props.workspaceId))
  declaredTags.value = (await api.tags.search('')).filter((t) => ids.has(t.id))
}

/** 标签候选（唯一筛选入口）：输入匹配标签名，已生效的不再出现；候选可叠加。 */
const inputFocused = ref(false)
const highlight = ref(0)
const candidates = computed(() => {
  const q = itemStore.filter.keyword.trim().toLowerCase()
  if (q === '') return []
  const active = new Set(itemStore.filter.tagIds)
  return declaredTags.value.filter((t) => !active.has(t.id) && t.name.toLowerCase().includes(q)).slice(0, 8)
})
const showCandidates = computed(() => inputFocused.value && candidates.value.length > 0)

function applyCandidate(tag: Tag): void {
  itemStore.toggleTagFilter(tag.id)
  itemStore.setKeyword('')
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

/** 当前按标签筛选的标签名列表（用于展示筛选状态，可单独/全部清除） */
const activeTagFilters = computed(() =>
  itemStore.filter.tagIds
    .map((id) => tagStore.allTags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t != null)
)

onMounted(() => {
  void tagStore.refreshAll()
  void refreshRoots()
  void refreshDeclared()
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
          v-model="itemStore.filter.keyword"
          class="input pl-8 w-full"
          placeholder="搜索文件名或标签…"
          data-shortcut="search"
          @input="itemStore.setKeyword(($event.target as HTMLInputElement).value)"
          @focus="inputFocused = true"
          @blur="inputFocused = false"
          @keydown="onInputKeydown"
        />
        <!-- 标签候选：输入即浮出，点选/回车加为标签筛选（可叠加；↑↓ 选择） -->
        <div
          v-if="showCandidates"
          class="absolute top-full left-0 right-0 mt-1 z-20 bg-[var(--bg-elev)] border border-[var(--border)] rounded-md shadow-lg overflow-hidden"
        >
          <button
            v-for="(tag, i) in candidates"
            :key="tag.id"
            type="button"
            class="w-full text-left px-3 py-1.5 text-[12px] cursor-pointer"
            :class="i === highlight ? 'bg-[var(--bg-hover)]' : ''"
            :title="tag.description ?? ''"
            @mousedown.prevent="applyCandidate(tag)"
            @mouseenter="highlight = i"
          >
            {{ tag.name }}
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

    <!-- 标签筛选状态：打标后在左侧"标签"面板点击标签即可筛选，此处展示并支持清除 -->
    <div v-if="activeTagFilters.length" class="flex items-center gap-1.5 flex-wrap">
      <span class="text-[11px] text-[var(--fg-dim)] shrink-0">筛选：</span>
      <button
        v-for="tag in activeTagFilters"
        :key="tag.id"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--accent)] text-white cursor-pointer hover:brightness-110 transition-colors"
        :title="`取消筛选 ${tag.name}`"
        @click="itemStore.toggleTagFilter(tag.id)"
      >
        {{ tag.name }} <X :size="10" />
      </button>
      <button
        class="text-[11px] text-[var(--fg-dim)] hover:text-[var(--danger)] cursor-pointer underline"
        title="清除全部标签筛选"
        @click="itemStore.clearTagFilters()"
      >
        清除全部
      </button>
    </div>
  </div>
</template>
