/**
 * 全局播放引擎（渲染层应用级单例，D43）——播放是"能力"，与 readAudioMeta 同族归壳；
 * 页面组件只是遥控器：引擎持有唯一 HTMLAudioElement（`new Audio()`，不入 DOM，不随
 * keyed router-view 整树卸载），切标签页/翻页/返回网格声音不断。
 *
 * 链路一次成型（D43 裁决：机制口就位、UI 押后）：
 *   audio → EQ 滤波链（8 段 peaking，默认平坦）→ AnalyserNode（频谱数据就绪）→ destination
 * 元素必须 crossOrigin='anonymous'：taghit-file 对页面 origin 是跨源，MediaElementSource
 * 的 CORS 净化要求匿名响应（协议已带 ACAO:*）——漏设则分析链全零。
 *
 * HMR 幂等：vite dev 热更会重新执行本模块——引擎挂 globalThis 符号键，重执行复用旧实例
 * （MediaElementSource 对单元素只能建一次；AudioContext 不随热更泄漏）。
 */
import { ref, watch, type Ref } from 'vue'
import { taghitFileUrl } from '../../lib/media'

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'error'

export interface PlaybackSnapshot {
  /** 引擎当前曲目身份（null = 从未播放）；界面以"是否本条目"区分遥控与去播 */
  itemId: string | null
  status: PlaybackStatus
  currentTime: number
  duration: number
  volume: number
  /** 单曲循环（audio.loop） */
  loop: boolean
}

/** 换曲目标：身份 + 来源路径（引擎内部经 taghit-file 协议构造 URL） */
export interface PlaybackTarget {
  itemId: string
  sourceUri: string
}

/** EQ 频段（Hz）；gain 全 0 = 平坦，UI 面板押后（D43） */
const EQ_FREQS = [60, 150, 400, 1000, 2400, 6000, 12000, 16000]

interface EngineCore {
  audio: HTMLAudioElement
  ctx: AudioContext | null
  filters: BiquadFilterNode[]
  analyser: AnalyserNode | null
  state: Ref<PlaybackSnapshot>
  listeners: Set<(s: PlaybackSnapshot) => void>
  rafId: number
}

function createEngine(): EngineCore {
  const audio = new Audio()
  audio.crossOrigin = 'anonymous'
  audio.preload = 'metadata'
  const core: EngineCore = {
    audio,
    ctx: null,
    filters: [],
    analyser: null,
    state: ref<PlaybackSnapshot>({ itemId: null, status: 'idle', currentTime: 0, duration: 0, volume: 1, loop: false }),
    listeners: new Set(),
    rafId: 0
  }

  function set(patch: Partial<PlaybackSnapshot>): void {
    core.state.value = { ...core.state.value, ...patch }
  }

  audio.addEventListener('loadedmetadata', () =>
    set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 })
  )
  audio.addEventListener('play', () => set({ status: 'playing' }))
  audio.addEventListener('pause', () => {
    if (core.state.value.status === 'playing') set({ status: 'paused' })
  })
  audio.addEventListener('ended', () => set({ status: 'paused', currentTime: core.state.value.duration }))
  audio.addEventListener('error', () => {
    // 空 src 时 error 事件也会 fire，只认真加载失败
    if (audio.src !== '') set({ status: 'error' })
  })

  // 进度统一走 rAF（60fps，比 timeupdate 的 ~4Hz 平滑）；只在播放中跑
  watch(
    () => core.state.value.status,
    (status) => {
      if (status === 'playing' && core.rafId === 0) {
        const tick = () => {
          set({ currentTime: core.audio.currentTime })
          core.rafId = requestAnimationFrame(tick)
        }
        core.rafId = requestAnimationFrame(tick)
      } else if (status !== 'playing' && core.rafId !== 0) {
        cancelAnimationFrame(core.rafId)
        core.rafId = 0
        set({ currentTime: core.audio.currentTime })
      }
    }
  )
  // 快照广播（HostApi onChange；冻结面是回调订阅，不暴露响应式对象）
  watch(core.state, (s) => {
    for (const cb of core.listeners) cb(s)
  })
  return core
}

/** Web Audio 链（首次播放时建）：MediaElementSource 单元素只能建一次；返回上下文。 */
function ensureGraph(core: EngineCore): AudioContext {
  if (core.ctx != null) return core.ctx
  const ctx = new AudioContext()
  const source = ctx.createMediaElementSource(core.audio)
  core.filters = EQ_FREQS.map((freq) => {
    const f = ctx.createBiquadFilter()
    f.type = 'peaking'
    f.frequency.value = freq
    f.Q.value = 1.1
    f.gain.value = 0
    return f
  })
  core.analyser = ctx.createAnalyser()
  core.analyser.fftSize = 2048
  let node: AudioNode = source
  for (const f of core.filters) {
    node.connect(f)
    node = f
  }
  node.connect(core.analyser)
  core.analyser.connect(ctx.destination)
  core.ctx = ctx
  return ctx
}

async function play(core: EngineCore, target?: PlaybackTarget): Promise<void> {
  if (target != null && target.itemId !== core.state.value.itemId) {
    core.state.value = { ...core.state.value, itemId: target.itemId, currentTime: 0, duration: 0, status: 'paused' }
    core.audio.src = taghitFileUrl(target.sourceUri)
  }
  if (core.state.value.status === 'idle') return
  const ctx = ensureGraph(core)
  if (ctx.state === 'suspended') await ctx.resume()
  try {
    await core.audio.play()
  } catch {
    // 自动播放拒绝/解码失败：错误事件会给 error 态，这里不重复定性
  }
}

function toggle(core: EngineCore): void {
  const status = core.state.value.status
  if (status === 'playing') core.audio.pause()
  else if (status === 'paused') void play(core)
}

function seek(core: EngineCore, t: number): void {
  const d = core.state.value.duration
  const clamped = d > 0 ? Math.max(0, Math.min(t, d)) : Math.max(0, t)
  core.audio.currentTime = clamped
  core.state.value = { ...core.state.value, currentTime: clamped }
}

function setVolume(core: EngineCore, v: number): void {
  const vol = Math.max(0, Math.min(1, v))
  core.audio.volume = vol
  core.state.value = { ...core.state.value, volume: vol }
}

function setLoop(core: EngineCore, loop: boolean): void {
  core.audio.loop = loop
  core.state.value = { ...core.state.value, loop }
}

// ---- 单例（HMR 幂等：Symbol.for 跨模块重执行共享） --------------------------------

const ENGINE_KEY = Symbol.for('taghit.playback-engine')
const engine: EngineCore = ((globalThis as unknown as Record<symbol, unknown>)[ENGINE_KEY] ??= createEngine()) as EngineCore

// ---- 壳内消费面（官方组件直接用模块函数；三方经 HostApi.playback 冻结子集） --------

/** 响应式快照（壳内组件 reactive 消费；快照对象整体替换，直接读值也安全）。 */
export function playbackState(): Readonly<Ref<PlaybackSnapshot>> {
  return engine.state
}

export function playbackSnapshot(): PlaybackSnapshot {
  return engine.state.value
}

/** 换曲即播（target 给定且非当前曲）；无 target = 续播/重播当前曲。 */
export function playbackPlay(target?: PlaybackTarget): Promise<void> {
  return play(engine, target)
}

export function playbackToggle(): void {
  toggle(engine)
}

export function playbackPause(): void {
  engine.audio.pause()
}

export function playbackSeek(t: number): void {
  seek(engine, t)
}

export function playbackSetVolume(v: number): void {
  setVolume(engine, v)
}

/** 单曲循环切换（audio.loop；ended 不再触发）。 */
export function playbackSetLoop(loop: boolean): void {
  setLoop(engine, loop)
}

/** 状态订阅（快照回调式），返回取消函数。 */
export function playbackSubscribe(cb: (s: PlaybackSnapshot) => void): () => void {
  engine.listeners.add(cb)
  return () => {
    engine.listeners.delete(cb)
  }
}

/** 频谱机制口（D43：数据就绪，可视化押后）；从未播放（图未建）→ null。 */
export function playbackAnalyser(): AnalyserNode | null {
  return engine.analyser
}

/** EQ 机制口：8 段 peaking，写 gain 即调音（UI 面板押后，D43）；图未建 → []。 */
export function playbackFilters(): readonly BiquadFilterNode[] {
  return engine.filters
}
