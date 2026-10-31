<script setup lang="ts">
/**
 * 音频播放器（detailPreview 提供方实现）。
 * 状态自持（D37 ③）：封面解析失败 → 内联占位、播放失败 → 兜底提示，详情页不感知。
 * 传输控制只管本条目——上一曲/下一曲是详情页骨架（顺序上下文翻页）的职责（D37）。
 * 样式走壳 token（视觉与主题同语）；三方代码不受壳机检约束（D42）。
 */
import { computed, ref, watch } from 'vue'
import type { ItemView } from '@renderer/features/contribution'
import { hostApi } from './context.ts'
import { fetchAudioMeta, type AudioMetaView } from './meta.ts'

const props = defineProps<{ item: ItemView }>()

const meta = ref<AudioMetaView | null>(null)
const audioFailed = ref(false)

const playing = ref(false)
const current = ref(0)
const duration = ref(0)
const volume = ref(1)
const seeking = ref(false)
const seekPreview = ref(0)

const audioEl = ref<HTMLAudioElement | null>(null)

const sourceUrl = computed(() =>
  props.item.sourceUri != null ? hostApi().media.fileUrl(props.item.sourceUri) : null
)
const coverUrl = computed(() =>
  meta.value?.previewUri != null ? hostApi().media.fileUrl(meta.value.previewUri) : null
)
/** 内嵌标题优先（干净无扩展名），回退文件名 */
const displayTitle = computed(() => meta.value?.tags.title ?? props.item.title)
const metaLine = computed(() => {
  const line = [meta.value?.tags.artist, meta.value?.tags.album].filter(Boolean).join(' · ')
  return line === '' ? null : line
})

let loadSeq = 0
async function loadMeta(): Promise<void> {
  const seq = ++loadSeq
  const item = props.item
  meta.value = null
  const m = await fetchAudioMeta(item).catch(() => null)
  if (seq !== loadSeq || props.item.id !== item.id) return // 竞态守卫：翻页后丢弃过期响应
  meta.value = m
}

watch(
  () => props.item.id,
  () => {
    audioFailed.value = false
    playing.value = false
    current.value = 0
    duration.value = 0
    seeking.value = false
    void loadMeta()
  },
  { immediate: true }
)

function togglePlay(): void {
  const el = audioEl.value
  if (el == null) return
  if (el.paused) void el.play()
  else el.pause()
}

function onSeekInput(event: Event): void {
  seeking.value = true
  seekPreview.value = Number((event.target as HTMLInputElement).value)
}
function onSeekCommit(): void {
  const el = audioEl.value
  if (el != null && Number.isFinite(seekPreview.value)) el.currentTime = seekPreview.value
  current.value = seekPreview.value
  seeking.value = false
}

watch(volume, (v) => {
  if (audioEl.value != null) audioEl.value.volume = v
})

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <div class="h-full w-full flex flex-col items-center justify-center gap-3 p-2 min-h-0">
    <!-- 封面：占满剩余空间等比收缩（槽位任意尺寸）；无封面给内联占位 -->
    <div class="flex-1 min-h-0 w-full flex items-center justify-center">
      <img
        v-if="coverUrl"
        :key="item.id"
        :src="coverUrl"
        alt="专辑封面"
        class="max-h-full max-w-full object-contain rounded-[6px] shadow-md"
      />
      <div v-else class="text-[var(--fg-dim)]">
        <svg viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
    </div>

    <!-- 元数据：内嵌标签优先，回退文件名 -->
    <div class="w-full max-w-md text-center min-w-0">
      <div class="text-[13px] truncate" :title="displayTitle">{{ displayTitle }}</div>
      <div v-if="metaLine != null" class="text-[11px] text-[var(--fg-dim)] truncate" :title="metaLine">{{ metaLine }}</div>
    </div>

    <!-- 传输控制 -->
    <div v-if="!audioFailed && sourceUrl != null" class="w-full max-w-md flex flex-col gap-1.5">
      <audio
        ref="audioEl"
        :key="item.id"
        :src="sourceUrl"
        class="hidden"
        @error="audioFailed = true"
        @play="playing = true"
        @pause="playing = false"
        @ended="playing = false"
        @timeupdate="current = ($event.target as HTMLAudioElement).currentTime"
        @loadedmetadata="duration = ($event.target as HTMLAudioElement).duration"
      ></audio>
      <div class="flex items-center gap-2 text-[11px] text-[var(--fg-dim)] tabular-nums">
        <span>{{ formatTime(seeking ? seekPreview : current) }}</span>
        <input
          type="range"
          class="flex-1 accent-[var(--accent)]"
          min="0"
          :max="duration || 0"
          step="0.1"
          :value="seeking ? seekPreview : current"
          aria-label="播放进度"
          @input="onSeekInput"
          @change="onSeekCommit"
        />
        <span>{{ formatTime(duration) }}</span>
      </div>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="w-8 h-8 flex items-center justify-center rounded-[6px] bg-[var(--bg-elev)] hover:bg-[var(--bg-hover)] text-[var(--fg)] cursor-pointer transition-colors"
          :title="playing ? '暂停' : '播放'"
          @click="togglePlay"
        >
          <svg v-if="!playing" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M4.5 2.5v11l9-5.5z" />
          </svg>
          <svg v-else viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
          </svg>
        </button>
        <input
          v-model.number="volume"
          type="range"
          class="w-24 accent-[var(--accent)]"
          min="0"
          max="1"
          step="0.05"
          aria-label="音量"
        />
      </div>
    </div>

    <!-- 播放失败兜底（自持，不给详情页添边界） -->
    <div v-else class="error-note">音频无法内嵌播放</div>
  </div>
</template>
