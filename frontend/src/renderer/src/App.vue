<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TabBar from './components/layout/TabBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import ActivityBar, { type ActivityTool } from './components/layout/ActivityBar.vue'
import { useTabStore } from './stores/tab'
import { useUiStore, type LeftTool, type RightTool } from './stores/ui'
import ContextMenuHost from './features/ContextMenuHost.vue'
import SurfaceHost from './features/SurfaceHost.vue'
import ServiceHost from './features/services/ServiceHost.vue'
import { openContextMenu } from './features/contextMenu'
import { listFeatures, resolvedIcon, type FeatureEntry } from './features/registry'
import { activeTabRoute, routeOfTab } from './features/tabs'
import { useItemStore } from './stores/item'

const route = useRoute()
const router = useRouter()
const tabStore = useTabStore()
const uiStore = useUiStore()
const itemStore = useItemStore()

onMounted(() => {
  tabStore.ensureHome()
})

/**
 * 路由守卫：**路由是标签的投影**（标签驱动路由）。
 *
 * 判定规则（2026-09-12 重写：修"侧键返回到不该去的地方"）：
 * 1. 路由命中某个标签 → 激活该标签（正规路径：打开条目/全页等动作先建标签再 push）；
 * 2. 路由没有对应标签（侧键退回到已被关闭的标签、手改 URL、历史里的过期条目）→
 *    **修正回活动标签**（replace，不写历史）——绝不"跳进"另一个还开着的标签；
 * 3. 主页（'/'）可多开，路由无法区分是哪一个主页标签 → 只在活动标签就是主页时认可。
 *
 * 历史语义见 features/tabs.ts：**切换标签不写历史**（replace），只有"打开一个视图"才 push。
 * 若此处改成"按 URL 激活任意匹配标签"，侧键返回就会不断把人甩进旧标签——那正是此前的缺陷。
 */
watch(
  () => route.fullPath,
  (path) => {
    if (path === '/') {
      if (tabStore.activeTab?.kind !== 'home') void router.replace(activeTabRoute())
      return
    }
    const match = tabStore.tabs.find((t) => routeOfTab(t) === path)
    if (match != null) {
      if (tabStore.activeKey !== match.key) tabStore.setActive(match.key)
      return
    }
    void router.replace(activeTabRoute())
  }
)

// 左活动栏 + 工具面板仅在工作区标签页显示（与主区内容强相关）
// 右活动栏 + 工具面板在工作区与条目详情页都显示；详情页"媒体信息"移入内容页，故只保留插件
const activeWsId = computed(() => tabStore.activeWorkspaceId)
const showRightSidebar = computed(() => route.name === 'workspace' || route.name === 'item')

// 工具清单来自功能组件注册表（贡献点驱动壳：壳不 import 面板组件）；
// 顺序可由拖拽调整并持久化。详情页右侧仅留 plugins（info 移入内容页）。
const ORDER_KEY = 'taghit.activityBarOrder'

type Side = 'left' | 'right'

function loadOrder(side: Side, defs: FeatureEntry[]): FeatureEntry[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return defs
    const parsed = JSON.parse(raw) as Record<Side, string[] | undefined>
    const ids = parsed[side]
    if (!ids?.length) return defs
    const byId = new Map(defs.map((t) => [t.manifest.id, t]))
    const ordered = ids.map((id) => byId.get(id)).filter((t): t is FeatureEntry => t != null)
    const rest = defs.filter((t) => !ids.includes(t.manifest.id))
    return [...ordered, ...rest]
  } catch {
    return defs
  }
}

const leftFeatures = ref<FeatureEntry[]>(loadOrder('left', listFeatures('activityBar:left')))
const rightFeatures = ref<FeatureEntry[]>(loadOrder('right', listFeatures('activityBar:right')))

const rightToolsShown = computed(() =>
  route.name === 'item'
    ? rightFeatures.value.filter((t) => t.manifest.id !== 'info')
    : rightFeatures.value
)

function toToolItems(defs: FeatureEntry[]): ActivityTool[] {
  return defs
    .map((f) => ({ id: f.manifest.id, label: f.manifest.title, icon: resolvedIcon(f) }))
    .filter((t): t is ActivityTool => t.icon != null)
}
const leftToolItems = computed(() => toToolItems(leftFeatures.value))
const rightToolItems = computed(() => toToolItems(rightToolsShown.value))

const activeLeftFeature = computed(
  () => leftFeatures.value.find((f) => f.manifest.id === uiStore.leftTool) ?? null
)
const activeRightFeature = computed(() => {
  const id: RightTool | null =
    route.name === 'item' ? (uiStore.rightTool === 'plugins' ? 'plugins' : null) : uiStore.rightTool
  return rightFeatures.value.find((f) => f.manifest.id === id) ?? null
})

function persistOrder(): void {
  try {
    localStorage.setItem(
      ORDER_KEY,
      JSON.stringify({
        left: leftFeatures.value.map((t) => t.manifest.id),
        right: rightFeatures.value.map((t) => t.manifest.id)
      })
    )
  } catch {
    // localStorage 不可用时忽略（仅丢失排序记忆）
  }
}

function onReorder(side: Side, from: number, to: number): void {
  const arr = side === 'left' ? leftFeatures.value : rightFeatures.value
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

// ── 右键菜单：事件拦截权归壳（ARCHITECTURE §3.2）──
// 组件只声明 context target（data-ctx-*）；根部统一拦截、就近取 target、构造上下文。
// 无 target 时不拦截：文本选择等场景保留原生菜单。
// selection 投影：target 已在多选集内 → 带出整个多选集（批量操作）；否则 = 单个 target。
function onContextMenu(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ctx-target]')
  if (el == null) return
  e.preventDefault()
  const kind = el.dataset.ctxTarget ?? ''
  const id = el.dataset.ctxId
  let selection: string[] = []
  if (kind === 'item' && id != null) {
    selection = itemStore.isSelected(id) ? itemStore.selectedIds : [id]
  }
  openContextMenu(
    { target: { kind, id }, workspaceId: tabStore.activeWorkspaceId, selection: { ids: selection } },
    e.clientX,
    e.clientY
  )
}
</script>

<template>
  <div class="h-full flex flex-col" @contextmenu="onContextMenu">
    <TabBar />

    <div class="flex-1 flex min-h-0">
      <!-- 左活动栏 + 工具面板（仅工作区标签页；内联条件以便模板类型收窄 activeWsId 为非空） -->
      <template v-if="route.name === 'workspace' && activeWsId != null">
        <ActivityBar
          :tools="leftToolItems"
          :active="uiStore.leftTool"
          side="left"
          @toggle="onToggleLeft"
          @reorder="(from, to) => onReorder('left', from, to)"
        />
        <SurfaceHost
          :feature="activeLeftFeature"
          surface="activityBar"
          :workspace-id="activeWsId"
          side="left"
          :component-props="{ workspaceId: activeWsId, side: 'left' }"
        />
      </template>

      <!-- 主内容区 -->
      <main class="flex-1 min-w-0 min-h-0">
        <!-- 按完整路径 key，切换工作区/条目时组件正确重建（避免 WorkspaceTab 复用旧 workspaceId 快照） -->
        <router-view :key="route.fullPath" />
      </main>

      <!-- 右活动栏 + 工具面板（工作区 + 条目详情；详情页媒体信息移入内容页，仅剩插件） -->
      <template v-if="showRightSidebar">
        <SurfaceHost
          :feature="activeRightFeature"
          surface="activityBar"
          side="right"
          :component-props="{ side: 'right' }"
        />
        <ActivityBar
          :tools="rightToolItems"
          :active="activeRightFeature?.manifest.id ?? null"
          side="right"
          @toggle="onToggleRight"
          @reorder="(from, to) => onReorder('right', from, to)"
        />
      </template>
    </div>

    <StatusBar />
    <ContextMenuHost />
    <ServiceHost />
  </div>
</template>
