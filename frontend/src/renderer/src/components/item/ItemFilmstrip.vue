<script setup lang="ts">
/**
 * 条目前后预览条（filmstrip）：相册式浏览的"前后各 6 张"。
 *
 * 三条口径：
 * - **顺序与翻页同源**：items 就是详情页的顺序窗口（含当前条目），点击 = 跳到那张；
 * - 只做载体，不做导航决策（当前条目、能不能翻都由详情页给）；
 * - 缩略图优先用派生缓存（视频抓帧的 previewUri），图片回落原图（经 taghit-file 协议），
 *   其余按类型出图标——不在这里发任何新请求。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { File, Film, FileText, Image as ImageIcon, Music } from 'lucide-vue-next'
import { taghitFileUrl } from '../../lib/media'
import type { ItemView } from '../../lib/viewModel'

const props = defineProps<{ items: ItemView[]; currentId: string }>()
const emit = defineEmits<{ pick: [id: string] }>()

const strip = ref<HTMLElement | null>(null)

/** 每格的载体：previewUri（派生小图）> 图片原图 > 类型图标。 */
function thumbOf(view: ItemView): string | null {
  if (view.previewUri != null) return taghitFileUrl(view.previewUri)
  if (view.mediaType === 'image' && view.sourceUri != null) return taghitFileUrl(view.sourceUri)
  return null
}

function iconOf(view: ItemView) {
  switch (view.mediaType) {
    case 'video':
      return Film
    case 'audio':
      return Music
    case 'document':
      return FileText
    case 'image':
      return ImageIcon
    default:
      return File
  }
}

const cells = computed(() =>
  props.items.map((view) => ({ view, thumb: thumbOf(view), icon: iconOf(view) }))
)

/** 当前格居中（翻页后自动跟随；不改变页面滚动位置——`inline: 'center'` + `block: 'nearest'`）。 */
async function centerCurrent(): Promise<void> {
  await nextTick()
  const el = strip.value?.querySelector<HTMLElement>('[data-current="true"]')
  el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
}

watch(() => props.currentId, centerCurrent)
watch(() => props.items, centerCurrent)
</script>

<template>
  <div
    ref="strip"
    class="flex items-center gap-1.5 overflow-x-auto px-2 py-2 border-t border-[var(--border)] bg-[var(--bg-elev)]"
    data-filmstrip
  >
    <button
      v-for="cell in cells"
      :key="cell.view.id"
      :data-current="cell.view.id === currentId"
      class="relative shrink-0 w-14 h-14 rounded overflow-hidden border transition-colors"
      :class="
        cell.view.id === currentId
          ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
          : 'border-[var(--border)] hover:border-[var(--fg-dim)]'
      "
      :title="cell.view.title"
      @click="emit('pick', cell.view.id)"
    >
      <img
        v-if="cell.thumb != null"
        :src="cell.thumb"
        :alt="cell.view.title"
        class="w-full h-full object-cover"
        loading="lazy"
        draggable="false"
      />
      <span v-else class="w-full h-full flex items-center justify-center text-[var(--fg-dim)]">
        <component :is="cell.icon" :size="18" />
      </span>
    </button>
  </div>
</template>
