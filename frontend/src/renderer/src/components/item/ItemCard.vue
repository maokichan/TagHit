<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import { Check, File, Film, Image, Music, FileText } from 'lucide-vue-next'
import type { ItemView } from '../../lib/viewModel'
import { taghitFileUrl, masonryRatioOf } from '../../lib/media'
import { requestVideoThumbnail } from '../../lib/thumbnailer'
import { useItemStore } from '../../stores/item'
import { useConfigStore } from '../../stores/config'
import type { LayoutMode } from '@shared/types/config'
import { formatDate, formatSize } from '../../lib/format'
import TagChip from '../common/TagChip.vue'

const props = withDefaults(
  defineProps<{ item: ItemView; interactiveTags?: boolean; selected?: boolean }>(),
  { interactiveTags: true, selected: false }
)
const emit = defineEmits<{
  (e: 'open', item: ItemView): void
  (e: 'select', item: ItemView): void
  (e: 'select-toggle', item: ItemView): void
  (e: 'tag-click', tagId: string): void
}>()

const config = useConfigStore()
const itemStore = useItemStore()

/** 列表布局（文件管理器样式）：行式渲染，区别于卡片（瀑布流/网格） */
const isList = computed(() => config.value<LayoutMode>('layout', 'layoutMode', 'masonry') === 'list')

// 缩略图（字节闸门）：图片经 taghit-file 协议直出原图；视频有缓存缩略图（previewUri）时直取，
// 无则触发渲染层抓帧生成（thumbnailer 按 contentHash 幂等，落盘后落库复用）
const thumbUrl = computed(() => {
  if (!props.item.sourceUri) return null
  if (props.item.mediaType === 'image') return taghitFileUrl(props.item.sourceUri)
  if (props.item.mediaType === 'video' && props.item.previewUri) return taghitFileUrl(props.item.previewUri)
  return null
})
const thumbFailed = ref(false)
watch(() => props.item.id, () => {
  thumbFailed.value = false
})
onMounted(() => {
  if (props.item.mediaType !== 'video' || props.item.previewUri != null) return
  requestVideoThumbnail(props.item, (itemId, patch) => itemStore.patchItemThumbnail(itemId, patch))
})

/** 瀑布流媒体宽高比（与 ItemGrid.ratioOf 同源：contentHash 派生，确定性不跳动） */
const aspectRatio = computed(() => String(masonryRatioOf(props.item)))
const isMasonry = computed(() => config.value<LayoutMode>('layout', 'layoutMode', 'masonry') === 'masonry')
const showTitles = computed(() => config.value('showTitles', 'showTitles', true))

// 非图片/无缩略图：统一图标占位
const iconMap: Record<string, Component> = {
  image: Image,
  video: Film,
  audio: Music,
  document: FileText,
  other: File
}
const TypeIcon = computed(() => iconMap[props.item.mediaType] ?? File)
</script>

<template>
  <!-- 列表布局：文件管理器行样式 -->
  <div
    v-if="isList"
    class="group relative panel overflow-hidden cursor-pointer hover:border-[var(--accent)]/50 hover:shadow-lg transition-all"
    :class="{
      'opacity-50': item.status === 'missing',
      'border-[var(--accent)]': selected
    }"
    :title="`${item.title}（双击打开详情）`"
    data-ctx-target="item"
    :data-ctx-id="item.id"
    @click.exact="emit('select', item)"
    @click.ctrl.exact="emit('select-toggle', item)"
    @click.meta.exact="emit('select-toggle', item)"
    @dblclick="emit('open', item)"
  >
    <div class="flex items-center gap-3 px-3 py-2">
      <div class="w-16 h-12 shrink-0 rounded-md bg-[var(--bg)] overflow-hidden flex items-center justify-center relative">
        <img
          v-if="thumbUrl && !thumbFailed"
          :src="thumbUrl"
          :alt="item.title"
          class="w-full h-full object-cover"
          loading="lazy"
          @error="thumbFailed = true"
        />
        <div v-else class="flex flex-col items-center gap-0.5 text-[var(--fg-dim)]">
          <component :is="TypeIcon" :size="20" />
          <span class="text-[8px] uppercase">{{ item.extension ?? item.mediaType }}</span>
        </div>
        <span
          v-if="selected"
          class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full flex items-center justify-center bg-[var(--accent)] text-white"
        >
          <Check :size="12" stroke-width={3} />
        </span>
        <span
          v-if="item.status === 'missing'"
          class="absolute top-0.5 right-0.5 px-1 py-px rounded bg-[var(--danger)] text-white text-[9px]"
        >
          缺失
        </span>
      </div>

      <!-- 信息区：文件名 + 标签 -->
      <div class="flex-1 min-w-0">
        <div class="text-[13px] leading-snug truncate" :title="item.title">{{ item.title }}</div>
        <div class="mt-0.5 flex items-center gap-1 overflow-hidden">
          <template v-if="item.tags.length">
            <template v-if="interactiveTags">
              <TagChip
                v-for="tag in item.tags.slice(0, 3)"
                :key="tag.id"
                :name="tag.name"
                @click="emit('tag-click', tag.id)"
              />
            </template>
            <template v-else>
              <span
                v-for="tag in item.tags.slice(0, 3)"
                :key="tag.id"
                class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-[var(--bg-hover)] text-[var(--fg-dim)]"
              >
                #{{ tag.name }}
              </span>
            </template>
            <span v-if="item.tags.length > 3" class="text-[10px] text-[var(--fg-dim)] shrink-0">
              +{{ item.tags.length - 3 }}
            </span>
          </template>
          <span v-else class="text-[10px] text-[var(--fg-dim)]">未打标签</span>
        </div>
      </div>

      <!-- 元信息列：大小 / 修改时间 / 类型 -->
      <div class="shrink-0 flex items-center gap-4 text-[11px] text-[var(--fg-dim)]">
        <span class="w-14 text-right tabular-nums">{{ formatSize(item.size) }}</span>
        <span class="tabular-nums">{{ formatDate(item.fileModifiedAt) }}</span>
        <span class="uppercase w-8 text-right">{{ item.extension ?? item.mediaType }}</span>
      </div>
    </div>
  </div>

  <!-- 卡片布局：瀑布流 / 网格 -->
  <div
    v-else
    class="group relative panel overflow-hidden cursor-pointer hover:border-[var(--accent)]/50 hover:shadow-lg transition-all"
    :class="{
      'opacity-50': item.status === 'missing',
      'border-[var(--accent)] shadow-lg': selected
    }"
    :title="`${item.title}（双击打开详情）`"
    data-ctx-target="item"
    :data-ctx-id="item.id"
    @click.exact="emit('select', item)"
    @click.ctrl.exact="emit('select-toggle', item)"
    @click.meta.exact="emit('select-toggle', item)"
    @dblclick="emit('open', item)"
  >
    <div
      class="bg-[var(--bg)] flex items-center justify-center overflow-hidden"
      :class="isMasonry ? '' : 'aspect-[4/3]'"
      :style="isMasonry ? { aspectRatio } : undefined"
    >
      <img
        v-if="thumbUrl && !thumbFailed"
        :src="thumbUrl"
        :alt="item.title"
        class="w-full h-full object-cover"
        loading="lazy"
        @error="thumbFailed = true"
      />
      <div v-else class="flex flex-col items-center gap-1 text-[var(--fg-dim)] py-6">
        <component :is="TypeIcon" :size="28" />
        <span class="text-[10px] uppercase">{{ item.extension ?? item.mediaType }}</span>
      </div>
      <span
        v-if="selected"
        class="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center bg-[var(--accent)] text-white shadow"
      >
        <Check :size="14" stroke-width={3} />
      </span>
      <span
        v-if="item.status === 'missing'"
        class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[var(--danger)] text-white text-[10px]"
      >
        缺失
      </span>
    </div>

    <!-- 标题区：固定高度（与 ItemGrid 布局常量一致，保证虚拟化高度精确） -->
    <div
      v-if="showTitles"
      class="p-2 space-y-1.5 h-[56px] overflow-hidden"
    >
      <div class="text-[12px] leading-snug truncate" :title="item.title">{{ item.title }}</div>
      <div v-if="item.tags.length" class="flex flex-wrap gap-1 overflow-hidden">
        <template v-if="interactiveTags">
          <TagChip
            v-for="tag in item.tags.slice(0, 4)"
            :key="tag.id"
            :name="tag.name"
            @click="emit('tag-click', tag.id)"
          />
        </template>
        <template v-else>
          <span
            v-for="tag in item.tags.slice(0, 4)"
            :key="tag.id"
            class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-[var(--bg-hover)] text-[var(--fg-dim)]"
          >
            #{{ tag.name }}
          </span>
        </template>
      </div>
      <div v-else class="text-[10px] text-[var(--fg-dim)]">未打标签</div>
    </div>
  </div>
</template>
