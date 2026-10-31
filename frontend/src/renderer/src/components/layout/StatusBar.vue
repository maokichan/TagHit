<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { useTabStore } from '../../stores/tab'
import { openBatchTagDialog } from '../../features/services/batchTag'

/**
 * 状态栏：多选状态与批量动作（选中即出现在这里，Esc 或 ✕ 退出）· 扫描状态 · 视图计数 · 插件占位。
 * 选择状态放底边栏是壳级决定；视图计数（D44 自搜索栏迁来）——item store 是全局单例，
 * 仅在活动标签为工作区时显示，否则是残留值。
 */
const itemStore = useItemStore()
const tabStore = useTabStore()

const showCount = computed(() => tabStore.activeWorkspaceId != null)

const PLUGIN_COUNT = 0
const count = computed(() => itemStore.selectedIds.length)

function batch(mode: 'add' | 'remove'): void {
  const ws = itemStore.viewWorkspaceId
  if (ws == null || count.value === 0) return
  openBatchTagDialog({
    mode,
    workspaceId: ws,
    count: count.value,
    onApply: async (m, tagIds) => {
      if (m === 'add') await itemStore.tagSelected(ws, tagIds)
      else await itemStore.untagSelected(ws, tagIds)
    }
  })
}

const statusText = computed(() => {
  if (itemStore.scanning) return '正在扫描…'
  if (itemStore.lastScanResult) {
    const r = itemStore.lastScanResult
    const unreadable =
      (r.dirsUnreadable > 0 ? ` / ${r.dirsUnreadable} 个目录不可读` : '') +
      (r.filesUnreadable > 0 ? ` / ${r.filesUnreadable} 个文件不可读` : '')
    const skipped = unreadable === '' ? '' : `${unreadable}（已跳过，未当消失处理）`
    return `扫描完成：+${r.itemsCreated} 新增 / ${r.itemsUpdated} 更新 / ${r.itemsRelocated} 认领 / ${r.itemsMissing} 缺失（${r.scannedRoots} 个来源根）${skipped}`
  }
  return null
})
</script>

<template>
  <footer class="flex items-center gap-2 px-3 h-6 text-[11px] text-[var(--fg-dim)]">
    <!-- 状态栏直接坐在底板上（D44）：无自身底色与接缝 -->
    <!-- 多选：状态 + 批量动作（原搜索栏下的操作条并入此处） -->
    <template v-if="count > 0">
      <span class="text-[var(--fg)] shrink-0">已选 {{ count }} 项</span>
      <button class="btn px-1.5 py-0.5 text-[11px]" @click="batch('add')">批量打标签…</button>
      <button class="btn px-1.5 py-0.5 text-[11px]" @click="batch('remove')">批量移除标签…</button>
      <button
        class="shrink-0 cursor-pointer hover:text-[var(--fg)] inline-flex"
        title="清空选择（Esc）"
        @click="itemStore.clearSelection()"
      >
        <X :size="12" />
      </button>
    </template>

    <!-- 扫描状态：占满剩余空间， hover 可见全文 -->
    <span v-if="statusText" class="flex-1 truncate min-w-0" :title="statusText">{{ statusText }}</span>
    <span v-else class="flex-1" />

    <!-- 视图计数：总数不受排序/分页影响 -->
    <span
      v-if="showCount"
      class="shrink-0 tabular-nums"
      :title="`成员总数 ${itemStore.total}；当前已渲染 ${itemStore.items.length}`"
    >
      <template v-if="itemStore.items.length < itemStore.total">
        已显示 {{ itemStore.items.length }} / 共 {{ itemStore.total }} 项
      </template>
      <template v-else>共 {{ itemStore.total }} 项</template>
    </span>

    <span class="flex items-center gap-1 shrink-0">
      <span class="inline-block w-1.5 h-1.5"
        :class="PLUGIN_COUNT > 0 ? 'bg-[var(--ok)]' : 'bg-[var(--border)]'"
      />
      {{ PLUGIN_COUNT }} 插件
    </span>
  </footer>
</template>
