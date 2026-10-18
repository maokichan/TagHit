/**
 * 缩略图（渲染层懒生成 + 落盘复用）。
 *
 * 思路移植自 0.1（freeze lib/thumbnailer.ts），按 0.2 字节闸门纪律收敛：
 * - 采集在渲染层：视频 <video> 经 taghit-file:// 协议拉流（协议已带 Range + ACAO，seek 不整文件
 *   下载、canvas 不被污染）抓帧；图片 <img> 同协议解码后 canvas 缩放绘制 → JPEG base64；
 * - 落盘与回写走窄桥 api.thumbnails.save（宿主写 {userData}/thumbnails/{contentHash}.jpg 并按哈希回写 DB）；
 * - 幂等：按 contentHash 去重（同内容多条目共享一份），pending/failed 各记一次；
 * - 视频 + 图片都走本通道（D36 扩展）：网格直出原图是滚动卡顿的根因——整幅解码一次数 MB，
 *   缩略图把滚动态的解码与内存成本钉在小图上；详情页主图仍取原图（全质量预览）。
 */

import { api } from '@shared/api'
import { taghitFileUrl } from './media'
import type { ItemView } from './viewModel'

const CONCURRENCY = 3
/** 采集最大边（像素），等比缩放；输出 JPEG 0.8 质量。 */
const MAX_SIDE = 480
/** 加载 / seek 超时（毫秒）。 */
const LOAD_TIMEOUT = 20000
const SEEK_TIMEOUT = 15000

const pending = new Set<string>()
const failed = new Set<string>()
let queue: Array<() => Promise<void>> = []
let active = 0

export interface ThumbCapture {
  base64: string
  width: number
  height: number
}

function waitEvent(
  target: EventTarget,
  event: string,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`视频 ${event} 超时`))
    }, timeoutMs)
    const onOk = (): void => {
      cleanup()
      resolve()
    }
    const onErr = (): void => {
      cleanup()
      reject(new Error('视频加载失败'))
    }
    function cleanup(): void {
      window.clearTimeout(timer)
      target.removeEventListener(event, onOk)
      target.removeEventListener('error', onErr, true)
    }
    target.addEventListener(event, onOk, { once: true })
    target.addEventListener('error', onErr, { once: true })
  })
}

/** canvas → JPEG base64（视频抓帧与图片缩放共用的编码尾段）。 */
function encodeCanvas(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('缩略图编码失败'))
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(new Error('base64 读取失败'))
        reader.readAsDataURL(blob)
      },
      'image/jpeg',
      0.8
    )
  })
}

/** 等比缩放绘制到 ≤MAX_SIDE 的画布。 */
function drawScaled(
  source: CanvasImageSource,
  w: number,
  h: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 不可用')
  ctx.drawImage(source, 0, 0, cw, ch)
  return { canvas, ctx }
}

/** 抓一帧：加载 → seek 到 10%（超短片按 1s）→ canvas 缩放 → JPEG base64。 */
export async function captureVideoThumb(sourceUri: string): Promise<ThumbCapture> {
  const url = taghitFileUrl(sourceUri)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.src = url

  try {
    await waitEvent(video, 'loadeddata', LOAD_TIMEOUT)
    if (!video.videoWidth || !video.videoHeight) throw new Error('视频尺寸不可用')
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const target = duration > 0 ? Math.min(1, duration * 0.1) : 1
    if (Math.abs(video.currentTime - target) > 0.1) {
      video.currentTime = target
      await waitEvent(video, 'seeked', SEEK_TIMEOUT)
    }

    const w = video.videoWidth
    const h = video.videoHeight
    const { canvas } = drawScaled(video, w, h)
    const base64 = await encodeCanvas(canvas)
    return { base64, width: w, height: h }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

/** 图片缩略：解码 → canvas 缩放 → JPEG base64（SVG 无固有尺寸时 naturalWidth 为 0 → 报错跳过）。 */
async function captureImageThumb(sourceUri: string): Promise<ThumbCapture> {
  const url = taghitFileUrl(sourceUri)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await waitEvent(img, 'load', LOAD_TIMEOUT)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) throw new Error('图片尺寸不可用')
  const { canvas } = drawScaled(img, w, h)
  const base64 = await encodeCanvas(canvas)
  return { base64, width: w, height: h }
}

/**
 * 请求生成某条目的缩略图（幂等；视频抓帧 / 图片缩放按类别分发）。
 * 生成成功后回调 onSaved(itemId, patch) 供 store 就地更新。
 * 无 contentHash / sourceUri → 直接忽略；失败记入 failed 不再重试（本轮会话）。
 */
export function requestThumbnail(
  item: ItemView,
  onSaved: (itemId: string, patch: { previewUri: string; width: number; height: number }) => void
): void {
  if (item.sourceUri == null || item.contentHash == null || item.previewUri != null) return
  if (item.mediaType !== 'video' && item.mediaType !== 'image') return
  // 已知小图（扫描尺寸 ≤ 采集上限）：原图即缩略图，不值得一份派生缓存
  if (
    item.mediaType === 'image' &&
    item.width != null &&
    item.height != null &&
    item.width <= MAX_SIDE &&
    item.height <= MAX_SIDE
  ) {
    return
  }
  const key = item.contentHash
  if (pending.has(key) || failed.has(key)) return

  pending.add(key)
  const task = async (): Promise<void> => {
    try {
      const thumb =
        item.mediaType === 'video'
          ? await captureVideoThumb(item.sourceUri!)
          : await captureImageThumb(item.sourceUri!)
      const { previewUri } = await api.thumbnails.save({
        contentHash: key,
        base64: thumb.base64,
        width: thumb.width,
        height: thumb.height,
      })
      onSaved(item.id, { previewUri, width: thumb.width, height: thumb.height })
    } catch (e) {
      failed.add(key)
      console.warn(`[thumbnailer] 缩略图失败（${item.title}）`, e)
    } finally {
      pending.delete(key)
    }
  }

  queue.push(task)
  pump()
}

function pump(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const task = queue.shift()!
    active++
    void task().finally(() => {
      active--
      pump()
    })
  }
}
