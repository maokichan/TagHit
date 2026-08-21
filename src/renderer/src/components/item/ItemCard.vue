<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import { File, Film, Image, Music, FileText } from 'lucide-vue-next'
import { taghitFileUrl } from '@shared/url'
import type { ItemWithTags } from '@shared/types/item'
import { useUiStore } from '../../stores/ui'
import { useItemStore } from '../../stores/item'
import { requestThumbnail } from '../../lib/thumbnailer'
import TagChip from '../common/TagChip.vue'

const props = withDefaults(
  defineProps<{ item: ItemWithTags; interactiveTags?: boolean; selected?: boolean }>(),
  { interactiveTags: true, selected: false }
)
const emit = defineEmits<{
  (e: 'open', item: ItemWithTags): void
  (e: 'select', item: ItemWithTags): void
  (e: 'tag-click', tagId: number): void
}>()

const uiStore = useUiStore()
const itemStore = useItemStore()

// 缩略图：preview_uri 存在（且为缩略图缓存路径）→ 直接显示；否则图标占位并懒生成
const previewSrc = computed(() =>
  props.item.previewUri ? taghitFileUrl(props.item.previewUri) : null
)
const imgError = ref(false)
watch(previewSrc, () => {
  imgError.value = false
})

// 卡片进入视口（虚拟化只挂载可见卡片）时，若媒体无缩略图则入队生成
const needsThumb = computed(
  () =>
    !props.item.previewUri &&
    (props.item.mediaType === 'image' || props.item.mediaType === 'video')
)
onMounted(() => {
  if (!needsThumb.value) return
  requestThumbnail(
    {
      itemId: props.item.id,
      contentHash: props.item.contentHash,
      sourceUri: props.item.sourceUri,
      mediaType: props.item.mediaType,
      size: props.item.size
    },
    (itemId, path) => itemStore.patchPreview(itemId, path)
  )
})

// 宽高比：优先用元数据（扫描时 image-size/ffprobe 提取，确定性高度，虚拟化不跳动）；
// 缺失时回退 4:3。极端比例钳制在 [1/2.2, 2.2]。
const MAX_RATIO = 2.2
const aspectRatio = computed(() => {
  const { width, height } = props.item
  if (width && height && height > 0) {
    const r = width / height
    return String(Math.min(Math.max(r, 1 / MAX_RATIO), MAX_RATIO))
  }
  return String(4 / 3)
})

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
  <div
    class="group relative panel overflow-hidden cursor-pointer hover:border-[var(--accent)]/50 hover:shadow-lg transition-all"
    :class="{
      'opacity-50': item.status === 'missing',
      'border-[var(--accent)] shadow-lg': selected
    }"
    :title="`${item.title}（双击打开详情）`"
    @click="emit('select', item)"
    @dblclick="emit('open', item)"
  >
    <div
      class="bg-[var(--bg)] flex items-center justify-center overflow-hidden"
      :class="uiStore.layoutMode === 'masonry' ? '' : 'aspect-[4/3]'"
      :style="uiStore.layoutMode === 'masonry' ? { aspectRatio } : undefined"
    >
      <img
        v-if="previewSrc && !imgError"
        :src="previewSrc"
        loading="lazy"
        class="w-full h-full object-cover"
        :alt="item.title"
        @error="imgError = true"
      />
      <div v-else class="flex flex-col items-center gap-1 text-[var(--fg-dim)] py-6">
        <component :is="TypeIcon" :size="28" />
        <span class="text-[10px] uppercase">{{ item.extension ?? item.mediaType }}</span>
      </div>
      <span
        v-if="item.status === 'missing'"
        class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[var(--danger)] text-white text-[10px]"
      >
        缺失
      </span>
    </div>

    <!-- 标题区：固定高度（与 ItemGrid 布局常量一致，保证虚拟化高度精确） -->
    <div
      v-if="uiStore.showTitles"
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
