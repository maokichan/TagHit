<script setup lang="ts">
/**
 * 槽位 tab 栈的条（D39）：tab = 小号标签（激活 = 顶部 accent 细条，与壳标签页同词汇），
 * 可拖拽换槽、悬停显关闭钮；条尾"+"= 回添菜单（D40：关掉的视图从这里回来）。
 * 拖放与关闭的语义归工作台（emit），本组件只呈现。
 */
import { Plus, X } from 'lucide-vue-next'
import type { DetailViewEntry } from './views'

defineProps<{
  tabs: Array<{ entry: DetailViewEntry; on: boolean }>
  draggingId: string | null
}>()

const emit = defineEmits<{
  activate: [viewId: string]
  close: [viewId: string]
  add: [e: MouseEvent]
  dragstart: [viewId: string, e: DragEvent]
  dragend: []
}>()
</script>

<template>
  <div class="wb-tabstrip">
    <div
      v-for="opt in tabs"
      :key="opt.entry.id"
      class="wb-tab group min-w-0"
      :class="{ 'wb-tab--on': opt.on, 'opacity-40': draggingId === opt.entry.id }"
      :title="opt.entry.title"
      draggable="true"
      @click="emit('activate', opt.entry.id)"
      @dragstart="emit('dragstart', opt.entry.id, $event)"
      @dragend="emit('dragend')"
    >
      <span class="truncate">{{ opt.entry.title }}</span>
      <button
        class="opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] p-0.5 cursor-pointer shrink-0"
        :title="$t('wb.tabstrip.closeView', { name: opt.entry.title })"
        @click.stop="emit('close', opt.entry.id)"
      >
        <X :size="11" />
      </button>
    </div>
    <button
      class="ml-auto icon-btn h-5 w-5 shrink-0"
      :title="$t('wb.tabstrip.add')"
      @click.stop="emit('add', $event)"
    >
      <Plus :size="12" />
    </button>
  </div>
</template>
