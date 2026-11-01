<script setup lang="ts">
/**
 * 歌词页（播放器内部页签，D43 修订：插件内容集中在一个页面自组织）。
 * 数据 = readAudioMeta 的 lyrics（.lrc 伴生优先，宿主交付原文，fetchAudioMeta 缓存与播放器共享）；
 * 解析与呈现归插件（lrc.ts）。同步 = 引擎在播本条目时按进度高亮活动行并瞬时滚动。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ItemView } from '@renderer/features/contribution'
import { hostApi } from './context.ts'
import { fetchAudioMeta } from './meta.ts'
import { activeLrcIndex, parseLrc, type LrcLine } from './lrc.ts'

const props = defineProps<{ item: ItemView }>()

const lyricsText = ref<string | null>(null)
const lines = ref<LrcLine[]>([])
const metaTags = ref<{ title: string | null; artist: string | null; album: string | null } | null>(null)
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
  const item = props.item
  lyricsText.value = null
  lines.value = []
  metaTags.value = null
  const m = await fetchAudioMeta(item)
  if (seq !== loadSeq || props.item.id !== item.id) return // 竞态守卫：翻页后丢弃过期响应
  metaTags.value = m?.tags ?? null
  if (m?.lyrics != null) {
    lyricsText.value = m.lyrics
    lines.value = parseLrc(m.lyrics)
  }
}
watch(
  () => props.item.id,
  () => void load(),
  { immediate: true }
)

/** 无词时的"正在播放"排版（内嵌标签优先，回退文件名） */
const nowTitle = computed(() => metaTags.value?.title ?? props.item.title)
const nowArtist = computed(() => metaTags.value?.artist ?? null)
const nowAlbum = computed(() => metaTags.value?.album ?? null)

const isCurrent = computed(() => snap.value.itemId === props.item.id)
/** 引擎在播本条目才同步高亮；播别的条目时本条目歌词静态全文展示 */
const activeIdx = computed(() =>
  isCurrent.value && lines.value.length > 0 ? activeLrcIndex(lines.value, snap.value.currentTime) : -1
)

// 歌词字号：manifest.settings 声明制（D46），值经 HostApi config 只读域取（响应式，宿主详情页改动即生效）
const fontSizeSetting = hostApi().config.ref<string>('audioPlayer', 'lyricsFontSize', 'standard')
const lineClass = computed(() => (fontSizeSetting.value === 'large' ? 'text-[16px]' : 'text-[14px]'))

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
        class="leading-relaxed transition-colors"
        :class="[lineClass, i === activeIdx ? 'text-[var(--fg)] font-medium' : 'text-[var(--fg-dim)]']"
      >{{ l.text }}</p>
      <div class="h-[38%] shrink-0" aria-hidden="true"></div>
    </div>
  </div>
  <!-- 无时间轴：静态全文 -->
  <div v-else-if="lyricsText != null" class="h-full w-full overflow-y-auto px-4 py-6">
    <div class="mx-auto max-w-md whitespace-pre-wrap leading-relaxed text-[var(--fg)]" :class="lineClass">{{ lyricsText }}</div>
  </div>
  <!-- 无词：正在播放排版（条目事实的阅读面；专辑播放列表等 Collection 后并入本列） -->
  <div v-else class="h-full w-full overflow-y-auto px-6 py-8">
    <div class="mx-auto max-w-md">
      <div class="text-[12px] text-[var(--fg-dim)] mb-4">正在播放</div>
      <div class="text-[16px] text-[var(--fg)] font-medium leading-snug">{{ nowTitle }}</div>
      <div v-if="nowArtist != null" class="text-[14px] text-[var(--fg-dim)] mt-1.5">{{ nowArtist }}</div>
      <div v-if="nowAlbum != null" class="text-[14px] text-[var(--fg-dim)]">{{ nowAlbum }}</div>
      <div class="divider my-5"></div>
      <div class="text-[12px] text-[var(--fg-dim)] leading-relaxed break-all" :title="item.title">{{ item.title }}</div>
    </div>
  </div>
</template>
