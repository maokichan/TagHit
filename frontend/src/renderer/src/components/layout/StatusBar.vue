<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()

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
  if (itemStore.scanning) return t('layout.status.scanning')
  if (itemStore.lastScanResult) {
    const r = itemStore.lastScanResult
    const unreadable =
      (r.dirsUnreadable > 0 ? t('layout.status.dirsUnreadable', { n: r.dirsUnreadable }) : '') +
      (r.filesUnreadable > 0 ? t('layout.status.filesUnreadable', { n: r.filesUnreadable }) : '')
    const skipped = unreadable === '' ? '' : `${unreadable}${t('layout.status.skippedSuffix')}`
    return t('layout.status.scanDone', {
      created: r.itemsCreated,
      updated: r.itemsUpdated,
      relocated: r.itemsRelocated,
      missing: r.itemsMissing,
      roots: r.scannedRoots,
      skipped
    })
  }
  return null
})
</script>

<template>
  <footer class="flex items-center gap-2 px-3 h-6 text-[11px] text-[var(--fg-dim)]">
    <!-- 状态栏直接坐在底板上（D44）：无自身底色与接缝 -->
    <!-- 多选：状态 + 批量动作（原搜索栏下的操作条并入此处） -->
    <template v-if="count > 0">
      <span class="text-[var(--fg)] shrink-0">{{ $t('layout.status.selected', { n: count }) }}</span>
      <button class="btn px-1.5 py-0.5 text-[11px]" @click="batch('add')">{{ $t('statusbar.batchTag') }}</button>
      <button class="btn px-1.5 py-0.5 text-[11px]" @click="batch('remove')">{{ $t('layout.status.batchRemove') }}</button>
      <button
        class="shrink-0 cursor-pointer hover:text-[var(--fg)] inline-flex"
        :title="$t('layout.status.clearSelection')"
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
      :title="$t('layout.status.countTitle', { total: itemStore.total, rendered: itemStore.items.length })"
    >
      <template v-if="itemStore.items.length < itemStore.total">
        {{ $t('layout.status.partialCount', { shown: itemStore.items.length, total: itemStore.total }) }}
      </template>
      <template v-else>{{ $t('layout.status.totalCount', { total: itemStore.total }) }}</template>
    </span>

    <span class="flex items-center gap-1 shrink-0">
      <span class="inline-block w-1.5 h-1.5"
        :class="PLUGIN_COUNT > 0 ? 'bg-[var(--ok)]' : 'bg-[var(--border)]'"
      />
      {{ $t('layout.status.pluginCount', { n: PLUGIN_COUNT }) }}
    </span>
  </footer>
</template>
