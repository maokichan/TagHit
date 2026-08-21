<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Settings, X } from 'lucide-vue-next'
import { useTabStore } from '../../stores/tab'

const router = useRouter()
const route = useRoute()
const tabStore = useTabStore()

// ── 拖拽排序：dragIndex（被拖的标签）+ overIndex（悬停目标，显示插入指示线） ──
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

function go(key: string): void {
  const tab = tabStore.tabs.find((t) => t.key === key)
  if (!tab) return
  if (tab.kind === 'home') {
    tabStore.setActive(key)
    router.push('/')
  } else if (tab.kind === 'settings') {
    tabStore.openSettings()
    router.push('/settings')
  } else if (tab.kind === 'item') {
    tabStore.setActive(key)
    router.push(`/item/${tab.itemId}${tab.workspaceId != null ? `?workspace=${tab.workspaceId}` : ''}`)
  } else {
    tabStore.setActive(key)
    router.push(`/workspace/${tab.workspaceId}`)
  }
}

function close(key: string): void {
  tabStore.close(key)
  const active = tabStore.activeTab
  if (active?.kind === 'workspace') {
    router.push(`/workspace/${active.workspaceId}`)
  } else if (active?.kind === 'settings') {
    router.push('/settings')
  } else if (active?.kind === 'item') {
    router.push(`/item/${active.itemId}${active.workspaceId != null ? `?workspace=${active.workspaceId}` : ''}`)
  } else {
    router.push('/')
  }
}

/** "+"：新建标签页 = 进入一个全新的首页 */
function newTab(): void {
  tabStore.openNewHome()
  router.push('/')
}

/** 设置：在设置页时点击 = 关闭设置标签回主页；否则打开设置标签 */
function onSettings(): void {
  if (route.name === 'settings') {
    tabStore.close('settings')
    const active = tabStore.activeTab
    if (active?.kind === 'workspace') router.push(`/workspace/${active.workspaceId}`)
    else router.push('/')
  } else {
    tabStore.openSettings()
    router.push('/settings')
  }
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
  <div class="flex items-center h-9 px-1.5 gap-1 border-b border-[var(--border)] bg-[var(--bg-elev)]">
    <!-- 标签（浏览器式：可拖拽、自动适应标签栏长度、主页为显式标签） -->
    <div class="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
      <div
        v-for="(tab, i) in tabStore.tabs"
        :key="tab.key"
        draggable="true"
        class="group flex items-center gap-2 px-3 h-6 rounded text-[12px] cursor-pointer select-none
               border border-transparent hover:bg-[var(--bg-hover)] transition-colors
               flex-1 basis-0 min-w-16 max-w-52"
        :class="[
          tabStore.activeKey === tab.key
            ? 'bg-[var(--bg-hover)] text-[var(--fg)] border-[var(--border)]'
            : 'text-[var(--fg-dim)]',
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
        <span class="truncate flex-1 text-center">{{ tab.title }}</span>
        <button
          class="opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] rounded p-0.5 cursor-pointer shrink-0"
          :title="`关闭 ${tab.title}`"
          @click.stop="close(tab.key)"
        >
          <X :size="12" />
        </button>
      </div>

      <button
        class="shrink-0 flex items-center justify-center w-6 h-6 rounded text-[var(--fg-dim)]
               hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] cursor-pointer"
        title="新建标签页（新主页）"
        @click="newTab"
      >
        <Plus :size="14" />
      </button>
    </div>

    <!-- 右侧：设置（作为标签页开/关） -->
    <button
      class="flex items-center justify-center w-7 h-7 rounded text-[var(--fg-dim)]
             hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] cursor-pointer shrink-0"
      :class="{ 'bg-[var(--accent-soft)] text-[var(--accent)]': route.name === 'settings' }"
      :title="route.name === 'settings' ? '关闭设置' : '打开设置'"
      @click="onSettings"
    >
      <Settings :size="15" />
    </button>
  </div>
</template>
