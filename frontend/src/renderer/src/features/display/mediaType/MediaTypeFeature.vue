<script setup lang="ts">
/**
 * 功能组件：媒体类型筛选（displayPanel 区块）
 * 数据源：config.fileFormatMap 推导的类别集合（v1 固定五类；dataSource 预留）
 */
import { useItemStore } from '../../../stores/item'

const itemStore = useItemStore()

const mediaTypes = [
  { key: '', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
  { key: 'document', label: '文档' }
] as const
</script>

<template>
  <div>
    <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">媒体类型</div>
    <div class="flex flex-wrap gap-1">
      <button
        v-for="mt in mediaTypes"
        :key="mt.key"
        class="px-2 py-0.5 rounded-md text-[12px] cursor-pointer transition-colors"
        :class="
          itemStore.filter.mediaType === mt.key
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--fg-dim)] hover:bg-[var(--bg-hover)]'
        "
        @click="itemStore.setMediaType(mt.key)"
      >
        {{ mt.label }}
      </button>
    </div>
  </div>
</template>
