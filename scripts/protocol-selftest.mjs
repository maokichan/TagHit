/**
 * 协议自测 v5（最终验证）：
 * 用「修复后的生产 handler 逻辑」+「生产 URL 形态」，验证渲染层 <img> 能加载，
 * 并额外用带生产 CSP 的页面验证 CSP 不拦截。
 * 运行：D:\PROJECT\TagHit\node_modules\.bin\electron.cmd scripts/protocol-selftest.mjs
 */
import { app, protocol, net, BrowserWindow } from 'electron'
import { pathToFileURL } from 'url'
import { normalize, join } from 'path'
import { writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'

const SCHEME = 'taghit-file'
const dir = mkdtempSync(join(tmpdir(), 'taghit-protocol-test-'))
const imgPath = join(dir, 'red.png')
const root = normalize(dir)

function extractPath(rawUrl) {
  const stripped = rawUrl
    .replace(/^[a-z][a-z0-9+.-]*:\/\/+/, '')
    .replace(/^[a-z][a-z0-9+.-]*:/, '')
    .replace(/^\/+/, '')
  return normalize(decodeURIComponent(stripped))
}

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { secure: true, supportFetchAPI: true, stream: true } }
])

app.whenReady().then(async () => {
  writeFileSync(
    imgPath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  )

  protocol.handle(SCHEME, (request) => {
    const normalized = extractPath(request.url)
    const ok = normalized.toLowerCase().startsWith(root.toLowerCase())
    console.log('[serving]', request.url, '->', normalized, 'ok=', ok)
    if (!ok) return new Response('forbidden', { status: 403 })
    return net.fetch(pathToFileURL(normalized).toString())
  })

  const testUrl = `${SCHEME}:///${imgPath.split(/[\\/]/).filter(Boolean).map(encodeURIComponent).join('/')}`
  console.log('[selftest] testUrl =', testUrl)

  async function testIn(pageUrl, label) {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false, contextIsolation: false } })
    await win.loadURL(pageUrl)
    const result = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const img = new Image()
        const timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 3000)
        img.onload = () => { clearTimeout(timer); resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight }) }
        img.onerror = () => { clearTimeout(timer); resolve({ ok: false, error: 'img.onerror' }) }
        img.src = ${JSON.stringify(testUrl)}
      })
    `)
    console.log(`[selftest] ${label} ->`, JSON.stringify(result))
    win.destroy()
    return result
  }

  await testIn('data:text/html,<html><body>t</body></html>', 'plain data: page')
  // 带生产 CSP 的页面（img-src 含 taghit-file:）
  const cspHtml =
    '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; img-src \'self\' taghit-file: data:"></head><body>csp</body></html>'
  await testIn(`data:text/html,${encodeURIComponent(cspHtml)}`, 'page with CSP(img-src taghit-file:)')

  app.exit(0)
})
