<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FolderOpen, Info, Puzzle, SlidersHorizontal, Tags } from 'lucide-vue-next'
import TabBar from './components/layout/TabBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import ActivityBar, { type ActivityTool } from './components/layout/ActivityBar.vue'
import PathsPanel from './components/workspace/PathsPanel.vue'
import TagsPanel from './components/workspace/TagsPanel.vue'
import DisplayPanel from './components/workspace/DisplayPanel.vue'
import InfoPanel from './components/layout/InfoPanel.vue'
import PluginsPanel from './components/layout/PluginsPanel.vue'
import { useTabStore } from './stores/tab'
import { useUiStore, type LeftTool, type RightTool } from './stores/ui'

const route = useRoute()
const router = useRouter()
const tabStore = useTabStore()
const uiStore = useUiStore()

onMounted(() => {
  tabStore.ensureHome()
})

// 守卫：仅对"工作区标签页"与"条目标签页"生效（条目详情用 :id，需区分 route.name）
watch(
  () => [route.name, route.params.id] as const,
  ([name, id]) => {
    if (name === 'workspace' && id != null) {
      const key = `ws:${id}`
      if (tabStore.activeKey !== key) {
        const target =
          tabStore.activeWorkspaceId != null
            ? `/workspace/${tabStore.activeWorkspaceId}`
            : '/'
        router.replace(target)
      }
    } else if (name === 'item' && id != null) {
      const key = `item:${id}`
      const tab = tabStore.tabs.find((t) => t.key === key)
      if (tab?.kind === 'item') {
        if (tabStore.activeKey !== key) tabStore.setActive(key)
      } else {
        // 无对应条目标签（例如手动改 URL）→ 回到活动标签
        const active = tabStore.activeTab
        if (active?.kind === 'workspace') router.replace(`/workspace/${active.workspaceId}`)
        else if (active?.kind === 'settings') router.replace('/settings')
        else if (active?.kind === 'item')
          router.replace(
            `/item/${active.itemId}${active.workspaceId != null ? `?workspace=${active.workspaceId}` : ''}`
          )
        else router.replace('/')
      }
    }
  }
)

// 左活动栏 + 工具面板仅在工作区标签页显示（与主区内容强相关）
// 右活动栏 + 工具面板在工作区与条目详情页都显示；详情页"媒体信息"移入内容页，故只保留插件
const activeWsId = computed(() => tabStore.activeWorkspaceId)
const showRightSidebar = computed(() => route.name === 'workspace' || route.name === 'item')
const rightToolsShown = computed(() =>
  route.name === 'item' ? rightTools.value.filter((t) => t.id !== 'info') : rightTools.value
)
const activeRightTool = computed(() => {
  if (route.name === 'item') return uiStore.rightTool === 'plugins' ? 'plugins' : null
  return uiStore.rightTool
})

// 工具清单（每侧互斥单开，点当前图标关闭）；顺序可由拖拽调整并持久化
const DEFAULT_LEFT_TOOLS: ActivityTool[] = [
  { id: 'paths', label: '路径', icon: FolderOpen },
  { id: 'tags', label: '标签', icon: Tags },
  { id: 'display', label: '显示', icon: SlidersHorizontal }
]
const DEFAULT_RIGHT_TOOLS: ActivityTool[] = [
  { id: 'info', label: '媒体信息', icon: Info },
  { id: 'plugins', label: '插件', icon: Puzzle }
]
const ORDER_KEY = 'taghit.activityBarOrder'

type Side = 'left' | 'right'

function loadOrder(side: Side, defaults: ActivityTool[]): ActivityTool[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Record<Side, string[] | undefined>
    const ids = parsed[side]
    if (!ids?.length) return defaults
    const byId = new Map(defaults.map((t) => [t.id, t]))
    const ordered = ids.map((id) => byId.get(id)).filter((t): t is ActivityTool => t != null)
    const rest = defaults.filter((t) => !ids.includes(t.id))
    return [...ordered, ...rest]
  } catch {
    return defaults
  }
}

const leftTools = ref<ActivityTool[]>(loadOrder('left', DEFAULT_LEFT_TOOLS))
const rightTools = ref<ActivityTool[]>(loadOrder('right', DEFAULT_RIGHT_TOOLS))

function persistOrder(): void {
  try {
    localStorage.setItem(
      ORDER_KEY,
      JSON.stringify({
        left: leftTools.value.map((t) => t.id),
        right: rightTools.value.map((t) => t.id)
      })
    )
  } catch {
    // localStorage 不可用时忽略（仅丢失排序记忆）
  }
}

function onReorder(side: Side, from: number, to: number): void {
  const arr = side === 'left' ? leftTools.value : rightTools.value
  const [t] = arr.splice(from, 1)
  if (t) arr.splice(to, 0, t)
  persistOrder()
}

function onToggleLeft(id: string): void {
  uiStore.toggleLeft(id as LeftTool)
}
function onToggleRight(id: string): void {
  uiStore.toggleRight(id as RightTool)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <TabBar />

    <div class="flex-1 flex min-h-0">
      <!-- 左活动栏 + 工具面板（仅工作区标签页；内联条件以便模板类型收窄 activeWsId 为非空） -->
      <template v-if="route.name === 'workspace' && activeWsId != null">
        <ActivityBar
          :tools="leftTools"
          :active="uiStore.leftTool"
          side="left"
          @toggle="onToggleLeft"
          @reorder="(from, to) => onReorder('left', from, to)"
        />
        <PathsPanel v-if="uiStore.leftTool === 'paths'" :workspace-id="activeWsId" side="left" />
        <TagsPanel v-else-if="uiStore.leftTool === 'tags'" :workspace-id="activeWsId" side="left" />
        <DisplayPanel v-else-if="uiStore.leftTool === 'display'" side="left" />
      </template>

      <!-- 主内容区 -->
      <main class="flex-1 min-w-0 min-h-0">
        <!-- 按完整路径 key，切换工作区/条目时组件正确重建（避免 WorkspaceTab 复用旧 workspaceId 快照） -->
        <router-view :key="route.fullPath" />
      </main>

      <!-- 右活动栏 + 工具面板（工作区 + 条目详情；详情页媒体信息移入内容页，仅剩插件） -->
      <template v-if="showRightSidebar">
        <InfoPanel v-if="route.name !== 'item' && uiStore.rightTool === 'info'" side="right" />
        <PluginsPanel v-else-if="uiStore.rightTool === 'plugins'" side="right" />
        <ActivityBar
          :tools="rightToolsShown"
          :active="activeRightTool"
          side="right"
          @toggle="onToggleRight"
          @reorder="(from, to) => onReorder('right', from, to)"
        />
      </template>
    </div>

    <StatusBar />
  </div>
</template>
