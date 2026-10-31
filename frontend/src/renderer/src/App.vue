<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TabBar from './components/layout/TabBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import ActivityBar, { type ActivityTool } from './components/layout/ActivityBar.vue'
import { useTabStore } from './stores/tab'
import { useUiStore, type LeftTool } from './stores/ui'
import ContextMenuHost from './features/ContextMenuHost.vue'
import CommandPalette from './features/CommandPalette.vue'
import SurfaceHost from './features/SurfaceHost.vue'
import ServiceHost from './features/services/ServiceHost.vue'
import { openContextMenu } from './features/contextMenu'
import { startItemDrag } from './features/drag'
import { listFeatures, resolvedIcon, type FeatureEntry } from './features/registry'
import { activeTabRoute, routeMatchesTab } from './features/tabs'
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
 * 判定规则（与 features/tabs.ts 的导航语义同一份）：
 * 1. 路由命中某个标签 → 激活该标签（正规路径：打开条目/全页等动作先建标签再 push）；
 * 2. 路由没有对应标签（侧键退回到已被关闭的标签、手改 URL、历史里的过期条目）→
 *    **修正回活动标签**（replace，不写历史）——绝不"跳进"另一个还开着的标签；
 * 3. 主页（'/'）可多开，路由无法区分是哪一个主页标签 → 只在活动标签就是主页时认可。
 *
 * 历史语义见 features/tabs.ts：**切换标签不写历史**（replace），只有"打开一个视图"才 push。
 * 若此处改成"按 URL 激活任意匹配标签"，侧键返回就会不断把人甩进旧标签。
 */
watch(
  () => route.fullPath,
  (path) => {
    if (path === '/') {
      if (tabStore.activeTab?.kind !== 'home') void router.replace(activeTabRoute())
      return
    }
    const match = tabStore.tabs.find((t) => routeMatchesTab(t, path))
    if (match != null) {
      if (tabStore.activeKey !== match.key) tabStore.setActive(match.key)
      return
    }
    void router.replace(activeTabRoute())
  }
)

// 左活动栏 + 工具面板仅在工作区标签页显示（与主区内容强相关）；右活动栏已裁撤（D40）
const activeWsId = computed(() => tabStore.activeWorkspaceId)

// 工具清单来自功能组件注册表（贡献点驱动壳：壳不 import 面板组件）；
// 顺序可由拖拽调整并持久化。
const ORDER_KEY = 'taghit.activityBarOrder'

function loadOrder(defs: FeatureEntry[]): FeatureEntry[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return defs
    const parsed = JSON.parse(raw) as { left?: string[] }
    const ids = parsed.left
    if (!ids?.length) return defs
    const byId = new Map(defs.map((t) => [t.manifest.id, t]))
    const ordered = ids.map((id) => byId.get(id)).filter((t): t is FeatureEntry => t != null)
    const rest = defs.filter((t) => !ids.includes(t.manifest.id))
    return [...ordered, ...rest]
  } catch {
    return defs
  }
}

const leftFeatures = ref<FeatureEntry[]>(loadOrder(listFeatures('activityBar:left')))

function toToolItems(defs: FeatureEntry[]): ActivityTool[] {
  return defs
    .map((f) => ({ id: f.manifest.id, label: f.manifest.title, icon: resolvedIcon(f) }))
    .filter((t): t is ActivityTool => t.icon != null)
}
const leftToolItems = computed(() => toToolItems(leftFeatures.value))

const activeLeftFeature = computed(
  () => leftFeatures.value.find((f) => f.manifest.id === uiStore.leftTool) ?? null
)

function persistOrder(): void {
  try {
    localStorage.setItem(
      ORDER_KEY,
      JSON.stringify({ left: leftFeatures.value.map((t) => t.manifest.id) })
    )
  } catch {
    // localStorage 不可用时忽略（仅丢失排序记忆）
  }
}

function onReorder(from: number, to: number): void {
  const [t] = leftFeatures.value.splice(from, 1)
  if (t) leftFeatures.value.splice(to, 0, t)
  persistOrder()
}

function onToggleLeft(id: string): void {
  uiStore.toggleLeft(id as LeftTool)
}

// ── 右键菜单：事件拦截权归壳（ARCHITECTURE §3.2）──
// 组件只声明 context target（data-ctx-*）；根部统一拦截、就近取 target、构造上下文。
// 无 target 时不拦截：文本选择等场景保留原生菜单。
// selection 投影：target 已在多选集内 → 带出整个多选集（批量操作）；否则 = 单个 target。
// workspaceId 投影：目标自带 `data-ctx-workspace`（如来源根树行——功能标签页里活动工作区为空）优先。
function onContextMenu(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ctx-target]')
  if (el == null) {
    // 空白处：声明了 data-ctx-shell 的容器（浏览网格）开壳菜单（全选/清空选择）；
    // 其余空白保留原生菜单（文本选择等场景，见上）。
    const shellEl = (e.target as HTMLElement).closest<HTMLElement>('[data-ctx-shell]')
    if (shellEl == null) return
    e.preventDefault()
    openContextMenu(
      {
        target: { kind: 'shell' },
        workspaceId: tabStore.activeWorkspaceId,
        selection: { ids: [...itemStore.selectedIds] }
      },
      e.clientX,
      e.clientY
    )
    return
  }
  e.preventDefault()
  const kind = el.dataset.ctxTarget ?? ''
  const id = el.dataset.ctxId
  const dirPath = el.dataset.ctxDir
  let selection: string[] = []
  if (kind === 'item' && id != null) {
    selection = itemStore.isSelected(id) ? itemStore.selectedIds : [id]
  }
  openContextMenu(
    {
      target: { kind, id, dirPath },
      workspaceId: el.dataset.ctxWorkspace ?? tabStore.activeWorkspaceId,
      selection: { ids: selection }
    },
    e.clientX,
    e.clientY
  )
}

// ── 拖出应用：与右键菜单同一份 DOM 契约、同一条投影规则（调用面统一入口）──
// 组件只声明"自己是上下文目标"并加 draggable；起手哪个目标、带出哪些条目由壳判定。
// 一律 preventDefault：网页拖拽放不出真实文件，改由宿主发起原生拖动（features/drag.ts）。
function onDragStart(e: DragEvent): void {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-ctx-target]')
  if (el == null) return
  if ((el.dataset.ctxTarget ?? '') !== 'item') return
  const id = el.dataset.ctxId
  if (id == null) return
  e.preventDefault()
  startItemDrag(itemStore.isSelected(id) ? [...itemStore.selectedIds] : [id])
}
</script>

<template>
  <div class="h-full flex flex-col" @contextmenu="onContextMenu" @dragstart="onDragStart">
    <TabBar />

    <!-- 中间区 = 底板上的浮动层（D44）：四周留白，左卡与主内容之间以间距分层，不画区域接缝 -->
    <div class="flex-1 flex min-h-0 p-2 gap-2">
      <!-- 左卡 = 活动栏 + 弹出面板同一张卡（仅工作区标签页；内联条件以便模板类型收窄 activeWsId 为非空） -->
      <template v-if="route.name === 'workspace' && activeWsId != null">
        <div class="flex shrink-0 min-h-0 bg-[var(--bg-elev)] border border-[var(--border)]">
          <ActivityBar
            :tools="leftToolItems"
            :active="uiStore.leftTool"
            side="left"
            @toggle="onToggleLeft"
            @reorder="onReorder"
          />
          <SurfaceHost
            :feature="activeLeftFeature"
            surface="activityBar"
            :workspace-id="activeWsId"
            side="left"
            :component-props="{ workspaceId: activeWsId, side: 'left' }"
          />
        </div>
      </template>

      <!-- 主内容区：留在底板上（D44），与左卡靠明度差 + 间距分层 -->
      <main class="flex-1 min-w-0 min-h-0">
        <!-- 按完整路径 key，切换工作区/条目时组件正确重建（避免 WorkspaceTab 复用旧 workspaceId 快照） -->
        <router-view :key="route.fullPath" />
      </main>
    </div>

    <StatusBar />
    <ContextMenuHost />
    <CommandPalette />
    <ServiceHost />
  </div>
</template>
