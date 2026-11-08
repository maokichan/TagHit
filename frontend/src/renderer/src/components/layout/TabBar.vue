<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Settings, X } from 'lucide-vue-next'
import { useTabStore, type Tab } from '../../stores/tab'
import { activateTab, closeTab } from '../../features/tabs'
import WindowControls from './WindowControls.vue'
import SearchPopup from './SearchPopup.vue'

const route = useRoute()
const tabStore = useTabStore()

// ── 拖拽排序：dragIndex（被拖的标签）+ overIndex（悬停目标，显示插入指示线） ──
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

/** 点击标签 = 激活（**不写历史**：换视角不等于去了新地方，见 features/tabs.ts）。 */
function go(key: string): void {
  const tab = tabStore.tabs.find((t) => t.key === key)
  if (tab) activateTab(tab)
}

/** 关闭标签：回落标签的路由同样不写历史；播放生命周期归 closeTab（D43：关闭播放中的条目标签即停播）。 */
function close(key: string): void {
  closeTab(key)
  const active = tabStore.activeTab
  if (active) activateTab(active)
}

/** "+"：新建标签页 = 进入一个全新的首页 */
function newTab(): void {
  tabStore.openNewHome()
  const active = tabStore.activeTab
  if (active) activateTab(active)
}

/** 设置：在设置页时点击 = 关闭设置标签回主页；否则打开设置标签 */
function onSettings(): void {
  if (route.name === 'settings') {
    tabStore.close('settings')
    const active = tabStore.activeTab
    if (active) activateTab(active)
    return
  }
  tabStore.openSettings()
  const settings = tabStore.tabs.find((t: Tab) => t.kind === 'settings')
  if (settings) activateTab(settings)
}

// ── 拖拽：HTML5 DnD + 插入指示线（左缘高亮 = 插入到该标签之前） ──
function onDragStart(i: number, e: DragEvent): void {
  dragIndex.value = i
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
}

function onDragOver(i: number, e: DragEvent): void {
  e.preventDefault()
  if (dragIndex.value == null) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  overIndex.value = i
}

function onDragLeave(): void {
  overIndex.value = null
}

function onDrop(i: number, e: DragEvent): void {
  e.preventDefault()
  if (dragIndex.value == null) return
  // 插入语义：指示线在目标标签之前；向右拖时移除后索引 -1
  const from = dragIndex.value
  const to = i > from ? i - 1 : i
  if (to !== from) tabStore.move(from, to)
  dragIndex.value = null
  overIndex.value = null
}

function onDragEnd(): void {
  dragIndex.value = null
  overIndex.value = null
}

/** 当前标签是否应显示插入指示线 */
function showIndicator(i: number): boolean {
  if (dragIndex.value == null || overIndex.value == null || i === dragIndex.value) return false
  const from = dragIndex.value
  const to = overIndex.value > from ? overIndex.value - 1 : overIndex.value
  return to === i && to !== from
}
</script>

<template>
  <!-- 无边框窗口（D17）：本条兼任标题栏——拖拽区归根部（空白处拖动/双击最大化），
       全部交互元素 no-drag；右上三键 = 自绘窗口控制键。
       顶栏直接坐在底板上（D44）：无自身底色，标签片本身就是底板上的卡；
       下缘一根发丝线区分顶栏与内容，两端内收不贴边（开发者定形）。 -->
  <div class="relative flex items-center h-11 px-2 gap-1.5 drag-region">
    <!-- 标签（浏览器式：可拖拽、自动适应标签栏长度、主页为显式标签） -->
    <div class="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto">
      <div
        v-for="(tab, i) in tabStore.tabs"
        :key="tab.key"
        draggable="true"
        class="group relative flex items-center gap-2 px-3 h-7 text-[12px] cursor-pointer select-none no-drag
               border transition-colors
               flex-1 basis-0 min-w-20 max-w-56"
        :class="[
          tabStore.activeKey === tab.key
            ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium border-[var(--accent-border)] shadow-sm'
            : 'text-[var(--fg-dim)] border-transparent hover:bg-[var(--bg-hover)]',
          dragIndex === i ? 'opacity-40' : '',
          showIndicator(i) ? 'border-l-2 border-l-[var(--accent)]' : ''
        ]"
        :title="tab.title"
        @click="go(tab.key)"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @dragleave="onDragLeave"
        @drop="onDrop(i, $event)"
        @dragend="onDragEnd"
      >
        <!-- 活动标签顶部指示条（高亮增强） -->
        <span
          v-if="tabStore.activeKey === tab.key"
          class="absolute top-0 left-2 right-2 h-[2px] bg-[var(--accent)]"
        />
        <span class="truncate flex-1 text-left">{{ tab.title }}</span>
        <button
          class="opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] p-0.5 cursor-pointer shrink-0"
          :title="$t('layout.tab.closeTab', { name: tab.title })"
          @click.stop="close(tab.key)"
        >
          <X :size="13" />
        </button>
      </div>

      <button
        class="shrink-0 flex items-center justify-center w-7 h-7 text-[var(--fg-dim)] no-drag
               hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] cursor-pointer"
        :title="$t('layout.tab.newTab')"
        @click="newTab"
      >
        <Plus :size="15" />
      </button>
    </div>

    <!-- 右侧：搜索 + 扫描（D44：入口上顶栏，坐底板）+ 设置（作为标签页开/关）+ 自绘窗口控制键 -->
    <SearchPopup />
    <button
      class="flex items-center justify-center w-8 h-8 text-[var(--fg-dim)] no-drag
             hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] cursor-pointer shrink-0"
      :class="{ 'bg-[var(--accent-soft)] text-[var(--accent)]': route.name === 'settings' }"
      :title="$t(route.name === 'settings' ? 'layout.tab.closeSettings' : 'layout.tab.openSettings')"
      @click="onSettings"
    >
      <Settings :size="16" />
    </button>
    <WindowControls class="no-drag shrink-0" />

    <!-- 下缘示意线：非交互元素，两端各内收一档 -->
    <span class="absolute bottom-0 left-2 right-2 h-px bg-[var(--border-soft)]" />
  </div>
</template>
