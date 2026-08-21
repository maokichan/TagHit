import { app } from 'electron'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

/** 缩略图缓存目录：{userData}/thumbnails（协议白名单已含 userData，可直接 taghit-file 访问） */
export function thumbnailsDir(): string {
  return join(app.getPath('userData'), 'thumbnails')
}

/** 判断某路径是否为缩略图缓存文件（用于列表查询时过滤"原图直出"） */
export function isThumbPath(p: string | null | undefined): boolean {
  if (!p) return false
  return p.toLowerCase().startsWith(thumbnailsDir().toLowerCase())
}

/**
 * ThumbnailService —— 缩略图文件缓存（以 content_hash 命名，天然去重）。
 * 生成侧：渲染进程懒生成（图片 canvas / 视频 <video> 抓帧），经 IPC 传回本服务落盘；
 * 主进程不做媒体解码，规避 ffmpeg 许可与原生依赖。
 */
export class ThumbnailService {
  cacheDir(): string {
    return thumbnailsDir()
  }

  /** 写入缩略图，返回绝对路径 */
  save(contentHash: string, data: Buffer): string {
    const dir = this.cacheDir()
    mkdirSync(dir, { recursive: true })
    const target = join(dir, `${contentHash}.jpg`)
    writeFileSync(target, data)
    return target
  }

  /** 计算缩略图目标路径（若存在则返回，否则 null） */
  resolveCached(contentHash: string): string | null {
    const target = join(this.cacheDir(), `${contentHash}.jpg`)
    return existsSync(target) ? target : null
  }
}
