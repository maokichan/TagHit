<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshCw, Search } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTagStore } from '../../stores/tag'
import { parseSearchInput } from '../../features/searchSyntax'
import { api } from '@shared/api'
import type { Id } from '@shared/contract'

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
 * 搜索框是标签筛选的唯一书写处：裸词元 = 已声明标签（必须含有），`-标签` = 排除，
 * 其余词元 = 标题关键字。没有候选弹层——词元留在栏里即筛选态，改字即改筛选；
 * 声明集（本工作区）在这里维护，解析据此把词元翻译成筛选三元组交回 store。
 */
const declaredIds = ref<Set<string>>(new Set())
async function refreshDeclared(): Promise<void> {
  await tagStore.refreshAll()
  declaredIds.value = new Set(await api.workspaces.declaredTags(props.workspaceId))
}

const nameToId = computed(() => {
  const m = new Map<string, string>()
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

function onInputFocus(): void {
  void refreshDeclared()
}

onMounted(() => {
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
          :value="itemStore.searchRaw"
          class="input pl-8 w-full"
          placeholder="搜索文件名或标签（-标签 排除）"
          data-shortcut="search"
          @input="itemStore.setSearchRaw(($event.target as HTMLInputElement).value)"
          @focus="onInputFocus"
        />
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
  </div>
</template>
