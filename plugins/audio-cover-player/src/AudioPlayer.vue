<script setup lang="ts">
/**
 * 音频播放器（detailPreview 提供方实现）——单页左右分区（D43 修订二）：
 * 左 = 黑胶 + 元数据 + 传输控制；右 = 歌词（专辑播放列表等 Collection 后并入右列）。
 * 声音与播放状态归全局播放引擎（hostApi().playback），本组件只出界面：
 * 翻页/切标签页组件重挂即重新订阅快照，声音不断；换曲 = 对新条目点播放。
 * 黑胶 = 旋转体：封面圆裁填盘心、随盘一起转（开发者定形）；转动 = 引擎有声音在响。
 * 盘尺寸在上下限内自适应槽位（clamp），低于下限的替代显示模式待定（见插件 TODO）。
 * 样式走壳 token（视觉与主题同语）；三方代码不受壳机检约束（D42）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ItemView } from '@renderer/features/contribution'
import { hostApi } from './context.ts'
import { fetchAudioMeta, type AudioMetaView } from './meta.ts'
import LyricsView from './LyricsView.vue'

const props = defineProps<{ item: ItemView }>()

const meta = ref<AudioMetaView | null>(null)
const snap = ref(hostApi().playback.snapshot())

let loadSeq = 0
async function loadMeta(): Promise<void> {
  const seq = ++loadSeq
  const item = props.item
  meta.value = null
  // fetchAudioMeta 自带失败可见与 null 兜底（meta.ts），这里不吞错也不重复记录
  const m = await fetchAudioMeta(item)
  if (seq !== loadSeq || props.item.id !== item.id) return // 竞态守卫：翻页后丢弃过期响应
  meta.value = m
}

watch(
  () => props.item.id,
  () => void loadMeta(),
  { immediate: true }
)

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

/** 引擎在播的正是本条目（遥控语义；否则播放钮 = 换曲即播） */
const isCurrent = computed(() => snap.value.itemId === props.item.id)
const isPlayingThis = computed(() => isCurrent.value && snap.value.status === 'playing')
const failed = computed(() => isCurrent.value && snap.value.status === 'error')

// ---- 黑胶转盘：整个盘（含封面圆）是旋转体；角速度缓动；reduce 下不转 ----
const discEl = ref<HTMLElement | null>(null)
const MAX_OMEGA = 160 // °/s（33⅓rpm ≈ 200，略缓）
const TAU = 0.55 // 速度时间常数：起转/减速的"电机感"
let raf = 0
let angle = 0
let omega = 0
let lastTs = 0
let mq: MediaQueryList | null = null

function tick(now: number): void {
  raf = requestAnimationFrame(tick)
  const dt = lastTs === 0 ? 0.016 : Math.min((now - lastTs) / 1000, 0.1)
  lastTs = now
  const target = mq?.matches === true || snap.value.status !== 'playing' ? 0 : MAX_OMEGA
  omega += (target - omega) * (1 - Math.exp(-dt / TAU))
  if (omega < 0.1 && target === 0) omega = 0
  if (omega === 0) return
  angle += omega * dt
  if (discEl.value != null) discEl.value.style.transform = `rotate(${angle}deg)`
}

onMounted(() => {
  mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  raf = requestAnimationFrame(tick)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  mq = null
})

/** 盘面：半透明叠加（高光/细槽微反光/内亮外暗底），亮暗主题下都是干净黑盘；
 *  尺寸在 [180px, 420px] 内自适应槽位（下限之下换显示模式：待定，见插件 TODO）。 */
const discStyle = computed(() => ({
  width: 'clamp(180px, min(100cqw, 100cqh), 420px)',
  aspectRatio: '1 / 1',
  background:
    'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.10), transparent 42%), ' +
    'repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 3px), ' +
    'radial-gradient(circle at 50% 50%, #1a1a1f 0%, #0e0e12 62%, #070709 100%)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
}))

// ---- 传输控制（进度条自绘：拖拽本地预览、松手 commit；音量拖拽实时） ----
const trackEl = ref<HTMLElement | null>(null)
const seeking = ref(false)
const seekPreview = ref(0)
const volEl = ref<HTMLElement | null>(null)
let volDragging = false
const prevVolume = ref(0.8) // 静音前音量（组件本地，取消静音恢复用）

const playTime = computed(() => (isCurrent.value ? snap.value.currentTime : 0))
const duration = computed(() => (isCurrent.value ? snap.value.duration : 0))
const progressPct = computed(() =>
  duration.value > 0 ? ((seeking.value ? seekPreview.value : playTime.value) / duration.value) * 100 : 0
)
const seekPct = computed(() => (duration.value > 0 ? (seekPreview.value / duration.value) * 100 : 0))
const muted = computed(() => snap.value.volume === 0)

function ratioFrom(el: HTMLElement | null, clientX: number): number {
  if (el == null) return 0
  const rect = el.getBoundingClientRect()
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
}

function onSeekDown(e: PointerEvent): void {
  if (duration.value <= 0) return
  seeking.value = true
  seekPreview.value = ratioFrom(trackEl.value, e.clientX) * duration.value
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onSeekMove(e: PointerEvent): void {
  if (seeking.value) seekPreview.value = ratioFrom(trackEl.value, e.clientX) * duration.value
}
function onSeekUp(e: PointerEvent): void {
  if (!seeking.value) return
  seeking.value = false
  hostApi().playback.seek(ratioFrom(trackEl.value, e.clientX) * duration.value)
}
function onSeekCancel(): void {
  seeking.value = false
}

function onVolDown(e: PointerEvent): void {
  volDragging = true
  hostApi().playback.setVolume(ratioFrom(volEl.value, e.clientX))
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onVolMove(e: PointerEvent): void {
  if (volDragging) hostApi().playback.setVolume(ratioFrom(volEl.value, e.clientX))
}
function onVolUp(): void {
  volDragging = false
}

/** 静音切换（记住静音前音量；音量条拖动即自然解除） */
function onMuteClick(): void {
  if (muted.value) {
    hostApi().playback.setVolume(prevVolume.value > 0 ? prevVolume.value : 0.8)
  } else {
    prevVolume.value = snap.value.volume
    hostApi().playback.setVolume(0)
  }
}

/** ±15s 快退/快进（只对引擎正在播的条目有意义） */
function skip(dt: number): void {
  if (!isCurrent.value || snap.value.status === 'idle') return
  hostApi().playback.seek(Math.max(0, snap.value.currentTime + dt))
}

function onLoopClick(): void {
  hostApi().playback.setLoop(!snap.value.loop)
}

function onPlayClick(): void {
  if (sourceUrl.value == null) return
  if (isCurrent.value) hostApi().playback.toggle()
  else hostApi().playback.play({ itemId: props.item.id, sourceUri: props.item.sourceUri as string })
}

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
  <div class="player-root">
    <!-- 左：黑胶 + 元数据 + 传输控制 -->
    <div class="player-left">
      <div class="flex-1 min-h-0 w-full flex items-center justify-center" style="container-type: size">
        <!-- 盘 = 旋转体：封面圆裁填盘心、中孔居中，随 rAF 一起转 -->
        <div ref="discEl" class="relative rounded-full will-change-transform" :style="discStyle">
          <div
            class="absolute rounded-full overflow-hidden"
            style="width: 34%; height: 34%; left: 33%; top: 33%; box-shadow: 0 0 0 1px rgba(255,255,255,0.08)"
          >
            <img v-if="coverUrl" :key="item.id" :src="coverUrl" alt="专辑封面" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full flex items-center justify-center" style="background: var(--bg-hover)">
              <svg
                viewBox="0 0 24 24"
                width="40%"
                height="40%"
                fill="none"
                stroke="var(--fg-dim)"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
          </div>
          <!-- 中孔 -->
          <div class="absolute rounded-full" style="width: 3%; height: 3%; left: 48.5%; top: 48.5%; background: var(--bg)"></div>
        </div>
      </div>

      <!-- 元数据：内嵌标签优先，回退文件名 -->
      <div class="w-full max-w-md text-center min-w-0 shrink-0">
        <div class="text-[13px] truncate" :title="displayTitle">{{ displayTitle }}</div>
        <div v-if="metaLine != null" class="text-[11px] text-[var(--fg-dim)] truncate" :title="metaLine">{{ metaLine }}</div>
      </div>

      <!-- 传输控制（遥控器：状态与声音在引擎） -->
      <div v-if="!failed && sourceUrl != null" class="w-full max-w-md flex flex-col gap-1.5 shrink-0">
        <div class="flex items-center gap-2 text-[11px] text-[var(--fg-dim)] tabular-nums select-none">
          <span class="w-10 text-right">{{ formatTime(seeking ? seekPreview : playTime) }}</span>
          <div
            ref="trackEl"
            class="group relative flex-1 h-5 cursor-pointer"
            @pointerdown="onSeekDown"
            @pointermove="onSeekMove"
            @pointerup="onSeekUp"
            @pointercancel="onSeekCancel"
          >
            <div
              class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[var(--bg-hover)] transition-transform origin-center group-hover:scale-y-[2.2]"
            ></div>
            <div
              class="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[var(--accent)]"
              :style="{ width: progressPct + '%' }"
            ></div>
            <div
              v-if="seeking"
              class="absolute top-0 -translate-x-1/2 -translate-y-full px-1.5 py-0.5 rounded bg-[var(--bg-elev)] border border-[var(--border)] text-[var(--fg)]"
              :style="{ left: seekPct + '%' }"
            >
              {{ formatTime(seekPreview) }}
            </div>
          </div>
          <span class="w-10">{{ formatTime(duration) }}</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer text-[var(--fg-dim)] hover:text-[var(--fg)] active:scale-95 transition-all"
            :class="isCurrent ? '' : 'opacity-40 cursor-default'"
            title="快退 15 秒"
            @click="skip(-15)"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M11.5 5v14l-8.2-7zM20.7 5v14l-8.2-7z" />
            </svg>
          </button>
          <button
            type="button"
            class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-white active:scale-95 transition-transform shrink-0"
            :class="sourceUrl != null ? 'bg-[var(--accent)] hover:opacity-90' : 'bg-[var(--bg-hover)] text-[var(--fg-dim)] cursor-default'"
            :title="isPlayingThis ? '暂停' : '播放'"
            @click="onPlayClick"
          >
            <svg v-if="!isPlayingThis" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M4.5 2.5v11l9-5.5z" />
            </svg>
            <svg v-else viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
            </svg>
          </button>
          <button
            type="button"
            class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer text-[var(--fg-dim)] hover:text-[var(--fg)] active:scale-95 transition-all"
            :class="isCurrent ? '' : 'opacity-40 cursor-default'"
            title="快进 15 秒"
            @click="skip(15)"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M3.3 5v14l8.2-7zM12.5 5v14l8.2-7z" />
            </svg>
          </button>
          <button
            type="button"
            class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors"
            :class="snap.loop ? 'text-[var(--accent)]' : 'text-[var(--fg-dim)] hover:text-[var(--fg)]'"
            :title="snap.loop ? '单曲循环：开' : '单曲循环：关'"
            @click="onLoopClick"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m17 2 4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="m7 22-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
          <div class="flex-1"></div>
          <button
            type="button"
            class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer text-[var(--fg-dim)] hover:text-[var(--fg)] active:scale-95 transition-all"
            :title="muted ? '取消静音' : '静音'"
            @click="onMuteClick"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <path v-if="!muted" d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path v-else d="m16 9 6 6M22 9l-6 6" />
            </svg>
          </button>
          <div
            ref="volEl"
            class="relative w-16 h-5 cursor-pointer"
            @pointerdown="onVolDown"
            @pointermove="onVolMove"
            @pointerup="onVolUp"
            @pointercancel="onVolUp"
          >
            <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[var(--bg-hover)]"></div>
            <div
              class="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[var(--fg-dim)]"
              :style="{ width: snap.volume * 100 + '%' }"
            ></div>
          </div>
        </div>
      </div>

      <!-- 播放失败兜底（引擎 error 态；失败可见性不静默） -->
      <div v-else-if="failed" class="error-note">音频无法内嵌播放</div>
    </div>

    <!-- 右：歌词（专辑播放列表等 Collection 后并入此列） -->
    <div class="player-right">
      <LyricsView :item="item" />
    </div>
  </div>
</template>

<style scoped>
/* 播放器分区（D43 修订二：单页左右，槽宽不足时上下堆叠）——插件代码不受壳机检约束（D42），
   颜色仍走壳 token。container query 以本组件根为查询容器。左右分区不画线（留白即分区）。 */
.player-root {
  container-type: inline-size;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.player-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: 55%;
  min-width: 0;
  min-height: 0;
  padding: 12px;
}
.player-right {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
@container (max-width: 620px) {
  .player-root {
    flex-direction: column;
  }
  .player-left {
    width: 100%;
    flex: 1;
  }
  .player-right {
    flex: none;
    height: 42%;
  }
}
</style>
