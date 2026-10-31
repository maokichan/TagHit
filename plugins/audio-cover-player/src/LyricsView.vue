<script setup lang="ts">
/**
 * 歌词工作台视图（detailView 贡献，D43）：条目歌词的阅读面——按声明常驻，
 * 与 detailPreview 正交；安置归工作台分割树（用户分配定终局）。
 * 数据 = readAudioMeta 的 lyrics（.lrc 伴生优先，宿主交付原文，fetchAudioMeta 缓存与播放器共享）；
 * 解析与呈现归插件（lrc.ts）。同步 = 引擎在播本条目时按进度高亮活动行并瞬时滚动。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDetailWorkbenchContext } from '@renderer/features/contribution'
import { hostApi } from './context.ts'
import { fetchAudioMeta } from './meta.ts'
import { activeLrcIndex, parseLrc, type LrcLine } from './lrc.ts'

const ctx = useDetailWorkbenchContext()

const lyricsText = ref<string | null>(null)
const lines = ref<LrcLine[]>([])
const snap = ref(hostApi().playback.snapshot())

let unsubPlayback: (() => void) | null = null
onMounted(() => {
  unsubPlayback = hostApi().playback.onChange((s) => {
    snap.value = s
  })
})
onBeforeUnmount(() => {
  unsubPlayback?.()
  unsubPlayback = null
})

let loadSeq = 0
async function load(): Promise<void> {
  const seq = ++loadSeq
  const item = ctx.item
  lyricsText.value = null
  lines.value = []
  const m = await fetchAudioMeta(item)
  if (seq !== loadSeq || ctx.item.id !== item.id) return // 竞态守卫：翻页后丢弃过期响应
  if (m?.lyrics != null) {
    lyricsText.value = m.lyrics
    lines.value = parseLrc(m.lyrics)
  }
}
watch(
  () => ctx.item.id,
  () => void load(),
  { immediate: true }
)

const isCurrent = computed(() => snap.value.itemId === ctx.item.id)
/** 引擎在播本条目才同步高亮；播别的条目时本条目歌词静态全文展示 */
const activeIdx = computed(() =>
  isCurrent.value && lines.value.length > 0 ? activeLrcIndex(lines.value, snap.value.currentTime) : -1
)

// 活动行滚动到容器 38% 高度处（瞬时，无平滑——行进进给是高频连续动作）
const scrollEl = ref<HTMLElement | null>(null)
const lineEls = new Map<number, HTMLElement>()
function setLineRef(i: number, el: unknown): void {
  if (el instanceof HTMLElement) lineEls.set(i, el)
  else lineEls.delete(i)
}
watch(activeIdx, (idx) => {
  if (idx < 0) return
  const el = lineEls.get(idx)
  const box = scrollEl.value
  if (el == null || box == null) return
  box.scrollTop = el.offsetTop - box.clientHeight * 0.38
})
</script>

<template>
  <!-- 带时间轴：行列表，活动行高亮 -->
  <div v-if="lines.length > 0" ref="scrollEl" class="relative h-full w-full overflow-y-auto px-4 py-6">
    <div class="mx-auto max-w-md flex flex-col gap-2.5">
      <p
        v-for="(l, i) in lines"
        :key="i"
        :ref="(el) => setLineRef(i, el)"
        class="text-[13px] leading-relaxed transition-colors"
        :class="i === activeIdx ? 'text-[var(--fg)] font-medium' : 'text-[var(--fg-dim)]'"
      >{{ l.text }}</p>
      <div class="h-[38%] shrink-0" aria-hidden="true"></div>
    </div>
  </div>
  <!-- 无时间轴：静态全文 -->
  <div v-else-if="lyricsText != null" class="h-full w-full overflow-y-auto px-4 py-6">
    <div class="mx-auto max-w-md whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--fg)]">{{ lyricsText }}</div>
  </div>
  <!-- 空态：一句（P4 最短行动句不适用——无词是事实不是死路） -->
  <div v-else class="h-full w-full flex items-center justify-center">
    <p class="text-[12px] text-[var(--fg-dim)]">无歌词</p>
  </div>
</template>
