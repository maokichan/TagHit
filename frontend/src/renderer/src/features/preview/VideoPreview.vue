<script setup lang="ts">
/**
 * 内置视频预览（detailPreview 默认提供方，D37）：渲染与失败兜底自持。
 */
import { ref, watch } from 'vue'
import { Film } from 'lucide-vue-next'
import { taghitFileUrl } from '../../lib/media'
import type { ItemView } from '../../lib/viewModel'

const props = defineProps<{ item: ItemView }>()
const failed = ref(false)
watch(
  () => props.item.id,
  () => (failed.value = false)
)
</script>

<template>
  <div class="w-full h-full flex items-center justify-center">
    <video
      v-if="!failed && item.sourceUri"
      :key="item.id"
      :src="taghitFileUrl(item.sourceUri)"
      controls
      class="max-w-full max-h-full rounded-md shadow-lg bg-black"
      @error="failed = true"
    ></video>
    <div v-else class="flex flex-col items-center gap-2 text-[var(--fg-dim)]">
      <Film :size="48" />
      <span class="text-sm">视频无法内嵌播放</span>
    </div>
  </div>
</template>
