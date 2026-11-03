/**
 * taghit-plugin:// 模块协议（D48 插件分发 v1）。
 *
 * 渲染层动态 import 已安装插件（bundle 形态）与宿主 vendor 模块（vue 共享运行时）的
 * 唯一通道——contextIsolation 渲染层没有 require，ESM import 需要可寻址的模块 URL。
 * 与 taghit-file:// 同款形态：opaque 特权 scheme（standard 已实测路由失败）+
 * corsEnabled + ACAO:*（模块脚本按 CORS 抓取；dev 源是 localhost、打包源是 file://，
 * * 都带非自身 Origin）。dev-source 形态的开发插件不经本协议（走 vite /@fs/ 编译）。
 *
 * 寻址：`taghit-plugin:///<id>/<相对路径>`（id = 用户安装位目录名，字符集门在
 * plugins.ts）。白名单复用 pathGate 的 isPathAllowed——安装位在 userData 下，
 * 本协议不新增 taghit-file 之外的文件面。
 * 保留 id `__vendor`：宿主 vendor 模块（当前仅 `vue`）——插件 bundle 的 vue import
 * 由渲染层 import map 指到这里，插件与壳共享同一 vue 实例（D42④ 纪律的分发版）。
 */

import { net, protocol } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { Readable } from 'node:stream'
import { isPathAllowed } from './pathGate.ts'
import type { AppServices } from '../application/index.ts'

export const TAGHIT_PLUGIN_SCHEME = 'taghit-plugin'

/** vendor 命名空间：宿主提供的共享模块（id 字符集门拒绝下划线开头，插件侧不可冒名）。 */
const VENDOR_ID = '__vendor'

const MIME_BY_EXT: Record<string, string> = {
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  css: 'text/css',
}

function mimeFor(file: string): string {
  const dot = file.lastIndexOf('.')
  const ext = dot >= 0 ? file.slice(dot + 1).toLowerCase() : ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/** 从 opaque URL 原始字符串取寻址段：taghit-plugin:///audioPlayer/index.js → audioPlayer/index.js */
function extractTarget(rawUrl: string): string {
  return decodeURIComponent(
    rawUrl
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/^\/+/, '')
  )
}

function fileResponse(file: string): Response {
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': mimeFor(file),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    },
  })
}

export interface PluginProtocolOptions {
  services: AppServices
  /** 用户安装位（bundle 形态目录名 = id）。 */
  installsRoot: string
  /** dev 态 vendor（vue 共享模块）的 dev server URL；打包态 null。 */
  devVendorUrl: string | null
  /** 打包态 vendor chunk 绝对路径（renderer-dist/assets/vue-vendor.js）；dev 态 null。 */
  packagedVendorPath: string | null
}

/** app ready 后调用。 */
export function registerTaghitPluginProtocol(opts: PluginProtocolOptions): void {
  protocol.handle(TAGHIT_PLUGIN_SCHEME, async (request) => {
    const target = extractTarget(request.url)
    const [id, ...rest] = target.split('/')
    const relPath = rest.join('/')

    // vendor：宿主共享模块（当前仅 vue）。dev 经 vite 编译（/src/vendor/vueVendor.ts，
    // bare import 被 vite 改写到预打包产物），打包态直出确定性命名的 vendor chunk。
    if (id === VENDOR_ID) {
      if (relPath !== 'vue') return new Response('forbidden', { status: 403 })
      try {
        if (opts.devVendorUrl != null) {
          const res = await net.fetch(opts.devVendorUrl)
          const headers = new Headers(res.headers)
          headers.set('Access-Control-Allow-Origin', '*')
          return new Response(res.body, { status: res.status, headers })
        }
        if (opts.packagedVendorPath != null && statSync(opts.packagedVendorPath).isFile()) {
          return fileResponse(opts.packagedVendorPath)
        }
      } catch (error) {
        console.error('[plugin-protocol] vendor 模块服务失败', error)
      }
      return new Response('vendor module unavailable', { status: 404 })
    }

    if (id === '' || relPath === '') return new Response('bad request', { status: 400 })
    const file = normalize(join(opts.installsRoot, id, relPath))
    if (!(await isPathAllowed(opts.services, file))) {
      console.warn(`[plugin-protocol] 拒绝访问路径: ${file}`)
      return new Response('forbidden', { status: 403 })
    }
    try {
      if (!statSync(file).isFile()) return new Response('not found', { status: 404 })
    } catch {
      return new Response('not found', { status: 404 })
    }
    return fileResponse(file)
  })
}
