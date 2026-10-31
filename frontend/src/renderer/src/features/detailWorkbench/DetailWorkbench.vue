<script setup lang="ts">
/**
 * 详情页工作台（D39/D41）——**分割树**容器：布局 = 叶（槽）与枝（分割）的树，
 * 任意槽可向上下左右分割出新槽；兄弟之间 1px 缝线即槽与槽之间的边缘（D40 边框分职）；
 * 视图填满槽位。渲染递归在 WBNodeView；布局规则在 slots.ts（纯模块，有断言）；
 * 本组件是装配根：提供视图上下文（context.ts）与节点 API（api.ts），持有拖放/菜单状态。
 */
import { ref } from 'vue'
import type { ItemView } from '../../lib/viewModel'
import type { SplitDir } from './slots'
import {
  layoutActivate,
  layoutCloseLeaf,
  layoutCloseView,
  layoutMoveView,
  layoutSetWeights,
  layoutSplit
} from './slots'
import { knownViews } from './views'
import { commitLayout, initWorkbenchLayout, workbenchLayoutRef } from './store'
import { provideDetailWorkbenchContext } from './context'
import { DRAG_MIME, provideWorkbenchApi, type WorkbenchApi } from './api'
import WBNodeView from './WBNodeView.vue'
import AddViewMenu from './AddViewMenu.vue'

const props = defineProps<{
  item: ItemView
  workspaceId: string | null
  editing: boolean
  windowViews: ItemView[]
  prev: ItemView | null
  next: ItemView | null
  go: (target: ItemView | null) => void
  toggleTag: (tagId: string) => Promise<void>
}>()

// 视图上下文：getter 包装 props（prop 变化即视图更新）
provideDetailWorkbenchContext({
  item: () => props.item,
  workspaceId: () => props.workspaceId,
  editing: () => props.editing,
  windowViews: () => props.windowViews,
  prev: () => props.prev,
  next: () => props.next,
  go: props.go,
  toggleTag: props.toggleTag
})

// 布局：挂载期解析（幂等；v1 四槽旧格式在此迁移为树）
initWorkbenchLayout(knownViews())
const layout = workbenchLayoutRef()

// ── 节点 API（树组件经 inject 取用；变更一律 commitLayout 落库） ────────────────
const draggingId = ref<string | null>(null)
const menu = ref<{ leafId: string; x: number; y: number } | null>(null)

const api: WorkbenchApi = {
  layout,
  draggingId,
  menu,
  openMenu(leafId, e) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    menu.value = { leafId, x: rect.left, y: rect.bottom + 4 }
  },
  closeMenu() {
    menu.value = null
  },
  startDrag(viewId, e) {
    draggingId.value = viewId
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(DRAG_MIME, viewId)
      e.dataTransfer.setData('text/plain', viewId)
    }
  },
  endDrag() {
    draggingId.value = null
  },
  isWorkbenchDrag(e) {
    return e.dataTransfer?.types.includes(DRAG_MIME) === true
  },
  activate(leafId, viewId) {
    const l = layout.value
    if (l != null) commitLayout(layoutActivate(l, leafId, viewId))
  },
  addToLeaf(viewId, leafId) {
    const l = layout.value
    if (l != null) commitLayout(layoutMoveView(l, viewId, leafId))
  },
  closeView(viewId) {
    const l = layout.value
    if (l != null) commitLayout(layoutCloseView(l, viewId))
  },
  splitLeaf(leafId: string, dir: SplitDir, viewId?: string) {
    const l = layout.value
    if (l != null) commitLayout(layoutSplit(l, leafId, dir, viewId))
  },
  closeLeaf(leafId) {
    const l = layout.value
    if (l != null) commitLayout(layoutCloseLeaf(l, leafId))
  },
  commitWeights(splitId, weights) {
    const l = layout.value
    if (l != null) commitLayout(layoutSetWeights(l, splitId, weights))
  }
}
provideWorkbenchApi(api)
</script>

<template>
  <!-- 底板：工作台根走最深底色并留边距——槽位卡片附在其上（D41 卡片/底板模型）。
       显示范围上限（D44 配套）：专属版心 --detail-max-width 居中，槽位不贴窗口边缘；
       权重是比例，容器宽窄不影响持久化语义。 -->
  <div
    v-if="layout"
    class="h-full w-full flex min-h-0 min-w-0 mx-auto max-w-[var(--detail-max-width)] bg-[var(--bg)] p-3"
  >
    <!-- 菜单的外点关闭遮罩（菜单本体 fixed，见 AddViewMenu） -->
    <div v-if="menu" class="fixed inset-0 z-30" @click="api.closeMenu()"></div>
    <WBNodeView :node="layout.tree" class="flex-1 min-w-0 min-h-0" />
    <AddViewMenu v-if="menu" />
  </div>
</template>
