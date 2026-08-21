<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FolderPlus, Search } from 'lucide-vue-next'
import { taghitFileUrl } from '@shared/url'
import { useWorkspaceStore } from '../stores/workspace'
import { useTabStore } from '../stores/tab'
import { useUiStore } from '../stores/ui'
import ItemCard from '../components/item/ItemCard.vue'
import type { ItemWithTags } from '@shared/types/item'

const router = useRouter()
const workspaceStore = useWorkspaceStore()
const tabStore = useTabStore()
const uiStore = useUiStore()

const newTitle = ref('')
const error = ref('')
const showNewForm = ref(false)

// 全局搜索（跨工作区，置顶）
const globalQuery = ref('')
const globalResults = ref<ItemWithTags[]>([])
const globalTotal = ref(0)
const globalLoading = ref(false)
let debounce: number | undefined

onMounted(() => workspaceStore.refresh())

/** 点击工作区：当前标签页直接变成该工作区（不新增标签） */
function openWorkspace(id: number, title: string): void {
  tabStore.openWorkspace(id, title)
  router.push(`/workspace/${id}`)
}

function toggleNewForm(): void {
  showNewForm.value = !showNewForm.value
  if (showNewForm.value) {
    error.value = ''
    newTitle.value = ''
  }
}

async function createWorkspace(): Promise<void> {
  error.value = ''
  if (!newTitle.value.trim()) return
  try {
    const ws = await workspaceStore.create(newTitle.value.trim())
    newTitle.value = ''
    showNewForm.value = false
    tabStore.openWorkspace(ws.id, ws.title)
    router.push(`/workspace/${ws.id}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

watch(globalQuery, () => {
  window.clearTimeout(debounce)
  debounce = window.setTimeout(runGlobalSearch, 250)
})

async function runGlobalSearch(): Promise<void> {
  const q = globalQuery.value.trim()
  if (!q) {
    globalResults.value = []
    globalTotal.value = 0
    return
  }
  globalLoading.value = true
  try {
    const res = await window.api.search.global({ workspaceId: 0, query: q, limit: 60 })
    globalResults.value = res.items
    globalTotal.value = res.total
  } finally {
    globalLoading.value = false
  }
}

function openGlobalItem(item: ItemWithTags): void {
  const ws = item.workspaceIds?.[0] ?? null
  // 点击搜索结果 = 新开一个条目标签页
  tabStore.openItem(item.id, ws, item.title)
  router.push(ws != null ? `/item/${item.id}?workspace=${ws}` : `/item/${item.id}`)
}

function coverUrl(path: string | null): string | null {
  return path ? taghitFileUrl(path) : null
}

const showCovers = computed(() => uiStore.showWorkspaceCovers)
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-3xl mx-auto px-6 py-8 flex flex-col items-center">
      <!-- 全局搜索（居中） -->
      <div class="relative w-full max-w-xl mb-5">
        <Search
          :size="15"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]"
        />
        <input
          v-model="globalQuery"
          class="input pl-9 w-full py-2"
          placeholder="全局搜索：@标签 type:image 关键词"
        />
      </div>

      <!-- 标题（居中，品牌蓝） -->
      <h1 class="text-[34px] font-semibold tracking-wide text-[var(--accent)] mb-6 select-none">
        TagHit
      </h1>

      <!-- 搜索中：结果显示瀑布流 -->
      <template v-if="globalQuery.trim()">
        <div class="text-[11px] text-[var(--fg-dim)] mb-2 self-start">
          {{ globalLoading ? '搜索中…' : `命中 ${globalTotal} 项` }}
        </div>
        <div v-if="globalResults.length" class="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3 w-full">
          <ItemCard
            v-for="item in globalResults"
            :key="item.id"
            :item="item"
            :interactive-tags="false"
            class="break-inside-avoid"
            @open="openGlobalItem"
            @select="openGlobalItem"
          />
        </div>
      </template>

      <!-- 未搜索：工作区栏（标题 + 新建按钮居中）+ 卡片 -->
      <template v-else>
        <!-- 工作区栏：居中一组，右侧"新建"按钮 -->
        <div class="flex items-center gap-2.5 mb-3">
          <span class="text-sm font-medium">工作区</span>
          <button
            class="flex items-center gap-1 text-[12px] text-[var(--accent)] hover:opacity-80 cursor-pointer"
            :title="showNewForm ? '收起' : '新建工作区'"
            @click="toggleNewForm"
          >
            <FolderPlus :size="13" />
            {{ showNewForm ? '收起' : '新建' }}
          </button>
        </div>

        <!-- 新建输入行（点击"新建"展开） -->
        <div v-if="showNewForm" class="w-full max-w-xl panel p-3 mb-5">
          <div class="flex gap-2">
            <input
              v-model="newTitle"
              class="input flex-1 text-[13px]"
              placeholder="输入工作区名称"
              autofocus
              @keyup.enter="createWorkspace"
              @keyup.esc="showNewForm = false"
            />
            <button class="btn btn-primary" @click="createWorkspace">创建</button>
            <button class="btn" @click="showNewForm = false">取消</button>
          </div>
          <p v-if="error" class="text-[11px] text-[var(--danger)] mt-2">{{ error }}</p>
        </div>

        <!-- 已有工作区卡片 -->
        <div
          v-if="workspaceStore.workspaces.length"
          class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 w-full"
        >
          <button
            v-for="ws in workspaceStore.workspaces"
            :key="ws.id"
            class="panel overflow-hidden text-left hover:border-[var(--accent)]/50 hover:shadow-lg transition-colors cursor-pointer"
            @click="openWorkspace(ws.id, ws.title)"
          >
            <div class="relative aspect-video bg-[var(--bg)] flex items-center justify-center">
              <img
                v-if="showCovers && coverUrl(ws.coverUri)"
                :src="coverUrl(ws.coverUri) as string"
                loading="lazy"
                class="w-full h-full object-cover"
                :alt="ws.title"
              />
              <FolderPlus v-else :size="24" class="text-[var(--fg-dim)] opacity-40" />
              <span
                class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px]"
              >
                {{ ws.paths.length }} 路径
              </span>
            </div>
            <div class="p-2">
              <div class="font-medium text-[13px] truncate">{{ ws.title }}</div>
            </div>
          </button>
        </div>
        <p v-else class="text-[12px] text-[var(--fg-dim)] mt-1">
          还没有工作区，点击上方"新建"创建第一个
        </p>
        <p v-if="!showCovers" class="text-[11px] text-[var(--fg-dim)] mt-3">
          已关闭工作区封面显示（可在设置中开启）
        </p>
      </template>
    </div>
  </div>
</template>
