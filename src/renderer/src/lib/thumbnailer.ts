import { taghitFileUrl } from '@shared/url'

/**
 * 渲染进程懒缩略图生成器。
 * 策略：网格只渲染视口附近卡片 → 卡片挂载时入队生成缩略图（并发上限 3），
 * 生成完成后经 IPC 落盘并回写 item.preview_uri，此后该条目直接加载小图。
 * 图片：fetch → createImageBitmap → canvas 缩放（canvas 不污染：协议已带 ACAO）。
 * 视频：<video crossOrigin=anonymous> 经协议 Range seek 抓关键帧 → canvas。
 * 编码不支持 / 超时 / 超大文件 → 记为失败，不再重试（卡片保持图标占位）。
 */

const CONCURRENCY = 3
/** 图片超过该大小不抓缩略图（fetch 整文件入内存）；视频走协议 Range 流式，不受此限制 */
const MAX_IMAGE_BYTES = 150 * 1024 * 1024
const MAX_SIDE = 480

let active = 0
const queue: Array<() => Promise<void>> = []
const pending = new Set<string>() // contentHash：正在生成 / 排队中
const failed = new Set<string>() // contentHash：已失败，不再重试

function pump(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const task = queue.shift() as () => Promise<void>
    active++
    task().finally(() => {
      active--
      pump()
    })
  }
}

function enqueue(task: () => Promise<void>): void {
  queue.push(task)
  pump()
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

async function canvasToBase64(canvas: HTMLCanvasElement): Promise<string | null> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8)
  )
  if (!blob || blob.size === 0) return null
  return blobToBase64(blob)
}

function drawScaled(canvas: HTMLCanvasElement, source: CanvasImageSource, sw: number, sh: number): void {
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context 不可用')
  ctx.drawImage(source, 0, 0, w, h)
}

async function captureImageThumb(sourceUri: string): Promise<string | null> {
  const res = await fetch(taghitFileUrl(sourceUri))
  if (!res.ok) throw new Error(`fetch 失败 ${res.status}`)
  const blob = await res.blob()
  const bmp = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    drawScaled(canvas, bmp, bmp.width, bmp.height)
    return await canvasToBase64(canvas)
  } finally {
    bmp.close()
  }
}

async function captureVideoThumb(sourceUri: string): Promise<string | null> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.src = taghitFileUrl(sourceUri)
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('视频加载超时')), 20_000)
      video.onloadeddata = () => {
        clearTimeout(t)
        resolve()
      }
      video.onerror = () => {
        clearTimeout(t)
        reject(new Error('视频格式不受支持'))
      }
    })
    if (!video.videoWidth || !video.videoHeight) throw new Error('视频无有效帧')
    // seek 到 1s 或 10% 处（协议 Range 支持，避免整文件下载）；duration 可能为 NaN/Infinity
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 2
    const target = Math.min(1, dur * 0.1)
    video.currentTime = target
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('seek 超时')), 15_000)
      video.onseeked = () => {
        clearTimeout(t)
        resolve()
      }
      video.onerror = () => {
        clearTimeout(t)
        reject(new Error('seek 失败'))
      }
    })
    const canvas = document.createElement('canvas')
    drawScaled(canvas, video, video.videoWidth, video.videoHeight)
    return await canvasToBase64(canvas)
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

export interface ThumbRequest {
  itemId: number
  contentHash: string | null
  sourceUri: string | null
  mediaType: string
  size: number | null
}

/** 请求生成缩略图（幂等：同哈希只生成一次；失败不重试）。生成成功后回调 onSaved。 */
export function requestThumbnail(
  req: ThumbRequest,
  onSaved: (itemId: number, path: string) => void
): void {
  const { itemId, contentHash, sourceUri, mediaType, size } = req
  if (!contentHash || !sourceUri) return
  if (pending.has(contentHash) || failed.has(contentHash)) return
  if (mediaType !== 'image' && mediaType !== 'video') return
  if (mediaType === 'image' && size != null && size > MAX_IMAGE_BYTES) {
    failed.add(contentHash)
    return
  }
  pending.add(contentHash)
  enqueue(async () => {
    try {
      const base64 =
        mediaType === 'image'
          ? await captureImageThumb(sourceUri)
          : await captureVideoThumb(sourceUri)
      if (!base64) {
        failed.add(contentHash)
        return
      }
      const path = await window.api.thumbnail.save({ contentHash, base64 })
      if (path) onSaved(itemId, path)
    } catch (e) {
      console.warn('[thumb] 生成失败', sourceUri, e instanceof Error ? e.message : e)
      failed.add(contentHash)
    } finally {
      pending.delete(contentHash)
    }
  })
}
