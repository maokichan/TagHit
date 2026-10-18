<script setup lang="ts">
/**
 * 内置音频预览（detailPreview 默认提供方，D37）：图标 + 原生控件，失败兜底自持。
 * （音频播放器功能组件将以自己的提供方认领音频条目替换本实现——后注册覆盖先注册。）
 */
import { ref, watch } from 'vue'
import { Music } from 'lucide-vue-next'
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
  <div class="w-full max-w-md flex flex-col items-center gap-4">
    <template v-if="!failed && item.sourceUri">
      <Music :size="72" class="text-[var(--fg-dim)]" />
      <audio :key="item.id" :src="taghitFileUrl(item.sourceUri)" controls class="w-full" @error="failed = true"></audio>
    </template>
    <div v-else class="flex flex-col items-center gap-2 text-[var(--fg-dim)]">
      <Music :size="48" />
      <span class="text-sm">音频无法内嵌播放</span>
    </div>
  </div>
</template>
