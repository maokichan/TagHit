<script setup lang="ts">
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Eye, EyeOff, SlidersHorizontal } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { useUiStore } from '../../stores/ui'

defineProps<{ side?: 'left' | 'right' }>()
const itemStore = useItemStore()
const uiStore = useUiStore()

const sortOptions = [
  { key: 'updatedAt', label: '最近更新' },
  { key: 'name', label: '名称' },
  { key: 'size', label: '大小' },
  { key: 'modifiedAt', label: '修改时间' },
  { key: 'addedAt', label: '添加时间' },
  { key: 'type', label: '类型' }
] as const

const layouts = [
  { key: 'masonry', label: '瀑布流' },
  { key: 'grid', label: '网格' },
  { key: 'list', label: '列表' }
] as const

const mediaTypes = [
  { key: '', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
  { key: 'document', label: '文档' }
] as const
</script>

<template>
  <aside
    class="w-64 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3 space-y-4">
      <div
        class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] flex items-center gap-1.5"
      >
        <SlidersHorizontal :size="12" /> 显示
      </div>

      <!-- 媒体类型 -->
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

      <!-- 排序 -->
      <div>
        <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">排序</div>
        <div class="flex gap-1.5">
          <select v-model="itemStore.sortBy" class="input flex-1 min-w-0 text-[12px]" title="排序字段">
            <option v-for="o in sortOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <button class="btn" :title="itemStore.sortDir === 'asc' ? '升序' : '降序'" @click="itemStore.toggleSortDir()">
            <ArrowUpWideNarrow v-if="itemStore.sortDir === 'asc'" :size="14" />
            <ArrowDownWideNarrow v-else :size="14" />
          </button>
        </div>
      </div>

      <!-- 布局 -->
      <div>
        <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">布局</div>
        <div class="flex gap-1.5">
          <button
            v-for="l in layouts"
            :key="l.key"
            class="btn flex-1 justify-center text-[12px]"
            :class="uiStore.layoutMode === l.key ? 'btn-primary' : ''"
            @click="uiStore.setLayoutMode(l.key)"
          >
            {{ l.label }}
          </button>
        </div>
      </div>

      <!-- 标题显隐 -->
      <div>
        <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">卡片标题</div>
        <button class="btn w-full justify-between text-[12px]" @click="uiStore.toggleShowTitles()">
          {{ uiStore.showTitles ? '显示标题' : '隐藏标题' }}
          <Eye v-if="uiStore.showTitles" :size="14" />
          <EyeOff v-else :size="14" />
        </button>
      </div>

      <p class="text-[11px] text-[var(--fg-dim)] leading-relaxed">
        瀑布流模式下，图片卡片按真实比例渲染（比例上限
        <span class="kbd">2.2:1</span>，避免极端横幅/竖幅撑开）。视频、音频与文档保持固定比例。
      </p>
    </div>
  </aside>
</template>
