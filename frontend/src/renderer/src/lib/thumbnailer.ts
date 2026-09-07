/**
 * 视频缩略图（渲染层懒生成 + 落盘复用）。
 *
 * 思路移植自 0.1（freeze lib/thumbnailer.ts），按 0.2 字节闸门纪律收敛：
 * - 抓帧在渲染层：<video> 经 taghit-file:// 协议拉流（协议已带 Range + ACAO，seek 不整文件下载、
 *   canvas 不被污染）→ canvas 缩放绘制 → JPEG base64；
 * - 落盘与回写走窄桥 api.thumbnails.save（宿主写 {userData}/thumbnails/{contentHash}.jpg 并按哈希回写 DB）；
 * - 幂等：按 contentHash 去重（同内容多条目共享一份），pending/failed 各记一次；
 * - 只服务视频（图片扫描时已解析尺寸、网格直出原图，不需要缩略图通道）。
 */

import { api } from '@shared/api'
import { taghitFileUrl } from './media'
import type { ItemView } from './viewModel'

const CONCURRENCY = 3
/** 抓帧最大边（像素），等比缩放；输出 JPEG 0.8 质量。 */
const MAX_SIDE = 480
/** 加载 / seek 超时（毫秒）。 */
const LOAD_TIMEOUT = 20000
const SEEK_TIMEOUT = 15000

const pending = new Set<string>()
const failed = new Set<string>()
let queue: Array<() => Promise<void>> = []
let active = 0

export interface VideoThumb {
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

/** 抓一帧：加载 → seek 到 10%（超短片按 1s）→ canvas 缩放 → JPEG base64。 */
export async function captureVideoThumb(sourceUri: string): Promise<VideoThumb> {
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
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 不可用')
    ctx.drawImage(video, 0, 0, cw, ch)

    const base64 = await new Promise<string>((resolve, reject) => {
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
    return { base64, width: w, height: h }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

/**
 * 请求生成某条目的视频缩略图（幂等）。生成成功后回调 onSaved(itemId, patch) 供 store 就地更新。
 * 无 contentHash / sourceUri / 非视频 → 直接忽略；失败记入 failed 不再重试（本轮会话）。
 */
export function requestVideoThumbnail(
  item: ItemView,
  onSaved: (itemId: string, patch: { previewUri: string; width: number; height: number }) => void
): void {
  if (item.mediaType !== 'video' || item.sourceUri == null || item.contentHash == null) return
  if (item.previewUri != null) return
  const key = item.contentHash
  if (pending.has(key) || failed.has(key)) return

  pending.add(key)
  const task = async (): Promise<void> => {
    try {
      const thumb = await captureVideoThumb(item.sourceUri!)
      const { previewUri } = await api.thumbnails.save({
        contentHash: key,
        base64: thumb.base64,
        width: thumb.width,
        height: thumb.height,
      })
      onSaved(item.id, { previewUri, width: thumb.width, height: thumb.height })
    } catch (e) {
      failed.add(key)
      console.warn(`[thumbnailer] 视频缩略图失败（${item.title}）`, e)
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
