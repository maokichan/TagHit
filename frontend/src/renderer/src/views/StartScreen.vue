<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FolderPlus, Search } from 'lucide-vue-next'
import { useWorkspaceStore } from '../stores/workspace'
import { useTabStore } from '../stores/tab'
import { itemRoute } from '../features/tabs'
import { api } from '@shared/api'
import { toItemView, type ItemView } from '../lib/viewModel'
import type { ItemContext } from '@shared/contract'
import ItemCard from '../components/item/ItemCard.vue'

const router = useRouter()
const workspaceStore = useWorkspaceStore()
const tabStore = useTabStore()

const newName = ref('')
const error = ref('')
const showNewForm = ref(false)

// 全局搜索（跨工作区，置顶；0.2 仅文件名关键词，DSL 待检索用例演进）
const globalQuery = ref('')
const globalResults = ref<ItemView[]>([])
const globalLoading = ref(false)
/**
 * **产出这批结果的关键词**（不是输入框的实时值）：输入框有 250ms 防抖，
 * 用户改完字立刻点旧结果时，实时值已经不是这批结果的条件了——若拿它当顺序上下文，
 * 详情页会发现"这条目不在序列里"并退成全部素材，方向键就会在整库里乱跳（实机症状）。
 */
const resultsKeyword = ref('')
let debounce: number | undefined

onMounted(() => {
  void workspaceStore.refresh().then(loadRootCounts)
})

/** 工作区卡「N 来源根」徽标（封面不在契约 v0，以根数代替老版的 paths 徽标） */
const rootCountByWs = ref<Record<string, number>>({})
async function loadRootCounts(): Promise<void> {
  const entries = await Promise.all(
    workspaceStore.workspaces.map(async (ws) => [ws.id, (await api.workspaces.listRoots(ws.id)).length] as const)
  )
  rootCountByWs.value = Object.fromEntries(entries)
}

/** 点击工作区：当前标签页直接变成该工作区（不新增标签） */
function openWorkspace(id: string, name: string): void {
  tabStore.openWorkspace(id, name)
  router.push(`/workspace/${id}`)
}

function toggleNewForm(): void {
  showNewForm.value = !showNewForm.value
  if (showNewForm.value) {
    error.value = ''
    newName.value = ''
  }
}

async function createWorkspace(): Promise<void> {
  error.value = ''
  if (!newName.value.trim()) return
  try {
    const ws = await workspaceStore.create(newName.value.trim())
    newName.value = ''
    showNewForm.value = false
    tabStore.openWorkspace(ws.id, ws.name)
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
    resultsKeyword.value = ''
    return
  }
  globalLoading.value = true
  try {
    // kinds: ['file'] —— 内容检索只认素材条目；锚条目（承接作品标签的空条目）不是内容
    const hits = await api.items.query({ titleContains: q, limit: 60, kinds: ['file'] })
    globalResults.value = hits.map(toItemView)
    resultsKeyword.value = q
  } finally {
    globalLoading.value = false
  }
}

function openGlobalItem(item: ItemView): void {
  // 点击搜索结果 = 新开一个条目标签页（0.2 全局结果不带工作区归属）
  // 顺序上下文 = 这次搜索的结果序列（跨工作区，标题子串即搜索结果的条件）
  const context: ItemContext = {
    workspaceId: null,
    order: 'createdAt',
    orderDir: 'asc',
    titleContains: resultsKeyword.value
  }
  tabStore.openItem(item.id, null, item.title, context)
  router.push(itemRoute(item.id, context))
}
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
          placeholder="全局搜索条目名关键词…"
          data-shortcut="search"
        />
      </div>

      <!-- 标题（居中，品牌蓝） -->
      <h1 class="text-[34px] font-semibold tracking-wide text-[var(--accent)] mb-6 select-none">
        TagHit
      </h1>

      <!-- 搜索中：结果显示瀑布流（CSS columns，卡片不拆行） -->
      <template v-if="globalQuery.trim()">
        <div class="text-[11px] text-[var(--fg-dim)] mb-2 self-start">
          {{ globalLoading ? '搜索中…' : `命中 ${globalResults.length} 项` }}
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
              v-model="newName"
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

        <!-- 列表加载失败：**明着报**，不要让"空列表"看起来像工作区丢了 -->
        <p
          v-if="workspaceStore.error"
          class="w-full max-w-xl text-[12px] text-[var(--danger)] panel p-3 mb-3 break-all"
        >
          工作区列表加载失败：{{ workspaceStore.error }}
          <button class="btn ml-2 text-[11px]" @click="workspaceStore.refresh()">重试</button>
        </p>

        <!-- 已有工作区卡片 -->
        <div
          v-if="workspaceStore.workspaces.length"
          class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 w-full"
        >
          <button
            v-for="ws in workspaceStore.workspaces"
            :key="ws.id"
            class="panel overflow-hidden text-left hover:border-[var(--accent)]/50 hover:shadow-lg transition-colors cursor-pointer"
            @click="openWorkspace(ws.id, ws.name)"
          >
            <div class="aspect-video bg-[var(--bg)] flex items-center justify-center relative">
              <FolderPlus :size="24" class="text-[var(--fg-dim)] opacity-40" />
              <span
                v-if="rootCountByWs[ws.id] !== undefined"
                class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px]"
              >
                {{ rootCountByWs[ws.id] }} 来源根
              </span>
            </div>
            <div class="p-2">
              <div class="font-medium text-[13px] truncate">{{ ws.name }}</div>
              <div class="text-[10px] text-[var(--fg-dim)] mt-0.5">
                创建于 {{ new Date(ws.createdAt).toLocaleDateString() }}
              </div>
            </div>
          </button>
        </div>
        <p v-else class="text-[12px] text-[var(--fg-dim)] mt-1">
          还没有工作区，点击上方"新建"创建第一个
        </p>
      </template>
    </div>
  </div>
</template>
