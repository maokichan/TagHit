import { app, net, protocol } from 'electron'
import { pathToFileURL } from 'url'
import { normalize } from 'path'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'
import { TAGHIT_FILE_SCHEME } from '@shared/url'
import type { AppContext } from './services/context'

/** 在 app ready 前注册特权 scheme */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: TAGHIT_FILE_SCHEME,
      // 注意：必须是 opaque（不能设 standard）。
      // 已实测：standard:true + 空 host 的 URL（taghit-file:///C%3A/...）不会被路由到 handler，
      // <img> 加载必失败。opaque 形态才能被渲染层正确加载。
      // corsEnabled：配合 ACAO 响应头，让渲染层 fetch / <video> 抓帧时 canvas 不被污染。
      privileges: { secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

/** 常见媒体 MIME（Range 响应需正确类型，视频元素依赖它完成解封装） */
const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
}

function mimeFor(file: string): string {
  const dot = file.lastIndexOf('.')
  const ext = dot >= 0 ? file.slice(dot + 1).toLowerCase() : ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/**
 * taghit-file:// 协议处理：
 * - 路径白名单：仅允许工作区扫描路径 + userData 内的文件（防任意文件读取）
 * - Range 请求（音视频 seek）：206 切片返回，避免整文件传输
 * - ACAO 头：渲染层 fetch / 媒体元素跨源使用（canvas 抓帧需要）
 */
export function registerTaghitFileProtocol(ctx: AppContext): void {
  function allowedRoots(): string[] {
    const rows = ctx.db.read
      .prepare('SELECT DISTINCT path FROM workspace_path')
      .all() as { path: string }[]
    const roots = new Set(rows.map((r) => normalize(r.path)))
    roots.add(normalize(app.getPath('userData')))
    return [...roots]
  }

  /** 从 opaque URL 原始字符串提取本地路径：taghit-file:///C%3A/Users/... → C:\Users\... */
  function extractPath(rawUrl: string): string {
    const stripped = rawUrl
      .replace(/^[a-z][a-z0-9+.-]*:\/\/+/, '')
      .replace(/^[a-z][a-z0-9+.-]*:/, '')
      .replace(/^\/+/, '')
    return normalize(decodeURIComponent(stripped))
  }

  protocol.handle(TAGHIT_FILE_SCHEME, async (request) => {
    const normalized = extractPath(request.url)
    const allowed = allowedRoots()
    const ok = allowed.some((root) => normalized.toLowerCase().startsWith(root.toLowerCase()))
    if (!ok) {
      console.warn(`[protocol] 拒绝访问路径: ${normalized}`)
      return new Response('forbidden', { status: 403 })
    }

    // Range 请求：206 切片（音视频 seek 关键，避免整文件传输）
    const range = request.headers.get('range')
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (m) {
        try {
          const size = statSync(normalized).size
          const start = m[1] ? parseInt(m[1], 10) : 0
          let end = m[2] ? parseInt(m[2], 10) : size - 1
          if (Number.isNaN(start) || start >= size) {
            return new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${size}` }
            })
          }
          end = Math.min(end, size - 1)
          const headers: Record<string, string> = {
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            'Access-Control-Allow-Origin': '*',
            'Content-Type': mimeFor(normalized)
          }
          const stream = Readable.toWeb(createReadStream(normalized, { start, end })) as ReadableStream
          return new Response(stream, { status: 206, headers })
        } catch {
          // stat 失败（文件已消失等）→ 走默认返回，由 net.fetch 处理错误
        }
      }
    }

    // 默认：整文件流式返回 + CORS 头
    const res = await net.fetch(pathToFileURL(normalized).toString())
    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Accept-Ranges', 'bytes')
    return new Response(res.body, { status: res.status, headers })
  })
}
