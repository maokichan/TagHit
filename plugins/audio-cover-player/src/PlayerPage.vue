<script setup lang="ts">
/**
 * 正在播放页（自开页，D47）：全局播放的常驻控制面——不进任何条目详情也能看盘、控播、读词。
 * 内容 = 当前播放条目的播放器（AudioPlayer 全页形态）；引擎没播过 → 空态。
 * 数据 = playback 引擎快照（哪首在播）+ items.get（条目视图模型）；换曲即跟随。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ItemView } from '@renderer/features/contribution'
import { hostApi } from './context.ts'
import AudioPlayer from './AudioPlayer.vue'

const item = ref<ItemView | null>(null)

let unsub: (() => void) | null = null
let loadSeq = 0
async function load(itemId: string | null): Promise<void> {
  const seq = ++loadSeq
  if (itemId == null) {
    item.value = null
    return
  }
  const view = await hostApi().items.get(itemId)
  if (seq !== loadSeq) return // 竞态守卫：换曲后丢弃过期响应
  item.value = view
}

onMounted(() => {
  void load(hostApi().playback.snapshot().itemId)
  unsub = hostApi().playback.onChange((s) => void load(s.itemId))
})
onBeforeUnmount(() => {
  unsub?.()
  unsub = null
})

const hasItem = computed(() => item.value != null)
</script>

<template>
  <div class="h-full w-full">
    <AudioPlayer v-if="hasItem" :key="item!.id" :item="item!" />
    <div v-else class="h-full w-full flex items-center justify-center">
      <p class="text-[12px] text-[var(--fg-dim)]">没有正在播放的内容——在音频条目详情页点播放。</p>
    </div>
  </div>
</template>
