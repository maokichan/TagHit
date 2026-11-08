<script setup lang="ts">
/**
 * 功能组件：排序（displayPanel 区块）。
 * 白名单 = 契约 ItemsQuery.order 三键（createdAt/title/sourceUri）；
 * listSortKeys 端点不在契约 v0，改为本地枚举。
 */
import { ArrowDownWideNarrow, ArrowUpWideNarrow } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useItemStore } from '../../../stores/item'

const itemStore = useItemStore()
const { t } = useI18n()

const sortOptions = [
  { key: 'createdAt', label: t('display.sort.createdAt') },
  { key: 'title', label: t('display.sort.title') },
  { key: 'sourceUri', label: t('display.sort.sourceUri') }
] as const
</script>

<template>
  <div>
    <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">{{ $t('display.sort.label') }}</div>
    <div class="flex gap-1.5">
      <select v-model="itemStore.sortBy" class="input flex-1 min-w-0 text-[12px]" :title="$t('display.sort.fieldHint')">
        <option v-for="o in sortOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>
      <button
        class="btn"
        :title="itemStore.sortDir === 'asc' ? $t('display.sort.asc') : $t('display.sort.desc')"
        @click="itemStore.toggleSortDir()"
      >
        <ArrowUpWideNarrow v-if="itemStore.sortDir === 'asc'" :size="14" />
        <ArrowDownWideNarrow v-else :size="14" />
      </button>
    </div>
  </div>
</template>
