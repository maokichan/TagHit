<script setup lang="ts">
import { ref, type Component } from 'vue'

export interface ActivityTool {
  id: string
  label: string
  icon: Component
}

defineProps<{
  tools: ActivityTool[]
  /** 当前打开的工具 id；null 表示该侧所有面板关闭 */
  active: string | null
  side: 'left' | 'right'
}>()

const emit = defineEmits<{
  (e: 'toggle', id: string): void
  (e: 'reorder', from: number, to: number): void
}>()

// 拖拽排序：图标可拖拽改变排列（与标签栏同语义：顶部指示线 = 插入到该图标之前）
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

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

function onDrop(i: number, e: DragEvent): void {
  e.preventDefault()
  if (dragIndex.value == null) return
  const from = dragIndex.value
  const to = i > from ? i - 1 : i
  if (to !== from) emit('reorder', from, to)
  dragIndex.value = null
  overIndex.value = null
}

function onDragEnd(): void {
  dragIndex.value = null
  overIndex.value = null
}

function showIndicator(i: number): boolean {
  if (dragIndex.value == null || overIndex.value == null || i === dragIndex.value) return false
  const from = dragIndex.value
  const to = overIndex.value > from ? overIndex.value - 1 : overIndex.value
  return to === i && to !== from
}
</script>

<template>
  <!-- VSCode 式活动栏：竖向图标条，永久可见，点击开/关面板，可拖拽排序 -->
  <div
    class="shrink-0 w-11 flex flex-col items-center py-2 gap-1 bg-[var(--bg-elev)]"
    :class="side === 'left' ? 'border-r border-[var(--border)]' : 'border-l border-[var(--border)]'"
  >
    <button
      v-for="(tool, i) in tools"
      :key="tool.id"
      draggable="true"
      class="w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer border-t-2 border-transparent"
      :class="[
        active === tool.id
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'text-[var(--fg-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]',
        dragIndex === i ? 'opacity-40' : '',
        showIndicator(i) ? 'border-t-[var(--accent)]' : ''
      ]"
      :title="`${tool.label}（拖拽调整顺序）`"
      @click="emit('toggle', tool.id)"
      @dragstart="onDragStart(i, $event)"
      @dragover="onDragOver(i, $event)"
      @drop="onDrop(i, $event)"
      @dragend="onDragEnd"
    >
      <component :is="tool.icon" :size="17" />
    </button>
  </div>
</template>
