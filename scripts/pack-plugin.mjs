/**
 * 插件 zip 打包（D48 分发 v1 的参考实现）：插件目录 → 预构建 ESM bundle → zip 包。
 * 用法：node scripts/pack-plugin.mjs <插件目录名> [-o <输出.zip>]
 * 产物：build/plugins/<id>-<version>.zip（缺省；-o 可指他处）。
 *
 * 管线：
 * 1. vite lib 构建（frontend 工具链，@vitejs/plugin-vue 编译 SFC；vue external）
 * 2. bundle 内的 `from "vue"` 文本重写为 `taghit-plugin:///__vendor/vue`
 *    （宿主共享模块，协议直出 vue-vendor chunk / dev 态 vite 编译——插件与壳同实例；
 *    import map 方案否决过的原因见 git log D48 步骤②：CSP 拦内联 script）
 * 3. SFC 样式块（vite 会拆出 .css 资产）转内联注入 footer 追加进 bundle——
 *    原生 ESM 不能 import CSS，样式必须在模块求值时注入 document
 * 4. manifest.json + bundle 打成 zip（stored 条目，与 scripts/plugins-selfcheck.ts
 *    的夹具写入器同一实现思路）
 *
 * 约束（写包前自查）：manifest 带齐 version/author/apiVersion（宿主安装校验必填）；
 * 插件源码 bare 依赖只允许 vue（其余一律打包内联或禁用——契约类型 type-only 不占运行时）。
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'

import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const frontend = join(root, 'frontend')

const args = process.argv.slice(2)
const name = args[0]
if (name == null || name.startsWith('-')) {
  console.error('用法：node scripts/pack-plugin.mjs <插件目录名> [-o <输出.zip>]')
  process.exit(1)
}
const pluginDir = join(root, 'plugins', name)
if (!existsSync(join(pluginDir, 'manifest.json'))) {
  console.error(`[pack-plugin] 插件目录缺 manifest.json：${pluginDir}`)
  process.exit(1)
}
const outArg = args.includes('-o') ? args[args.indexOf('-o') + 1] : null

const manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf8'))
for (const field of ['version', 'apiVersion']) {
  if (typeof manifest[field] !== 'string' || manifest[field] === '') {
    console.error(`[pack-plugin] manifest.${field} 缺失——zip 分发必填（D48，宿主安装校验会拒）`)
    process.exit(1)
  }
}

// ---- 1. vite lib 构建（cwd=frontend；临时目录放 frontend/node_modules/ 下——
//      config 的 import 'vite'/'@vitejs/plugin-vue' 要靠 node 解析链够到 frontend 依赖） ----
const tmp = mkdtempSync(join(frontend, 'node_modules', '.tmp-pack-'))
const dist = join(tmp, 'dist')
const configFile = join(tmp, 'vite.config.mjs')
writeFileSync(
  configFile,
  `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  configFile: false,
  plugins: [vue()],
  build: {
    lib: { entry: ${JSON.stringify(join(pluginDir, 'src', 'index.ts'))}, formats: ['es'], fileName: 'index' },
    outDir: ${JSON.stringify(dist)},
    emptyOutDir: true,
    minify: false,
    rollupOptions: { external: [/^vue($|\\/)/] },
  },
})
`
)
console.log('=== vite lib 构建 ===')
const build = spawnSync(process.execPath, [join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', configFile], {
  cwd: frontend,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (build.status !== 0) {
  console.error('[pack-plugin] 构建失败')
  process.exit(build.status ?? 1)
}

// ---- 2+3. vue 导入重写 + CSS 内联注入 footer ----
const bundlePath = join(dist, 'index.js')
let bundle = readFileSync(bundlePath, 'utf8')
const VENDOR_URL = 'taghit-plugin://__vendor/vue'
const vueImportCount = (bundle.match(/(from\s*|import\s*\(\s*)["']vue["']/g) ?? []).length
bundle = bundle.replace(/(from\s*|import\s*\(\s*)["']vue["']/g, `$1"${VENDOR_URL}"`)
if (vueImportCount === 0) {
  console.warn('[pack-plugin] 警告：bundle 内未见 vue 导入（插件不用组件？）——重写跳过')
} else {
  console.log(`=== vue 导入重写 → ${VENDOR_URL}（${vueImportCount} 处） ===`)
}

const cssFiles = readdirSync(dist).filter((f) => f.endsWith('.css'))
if (cssFiles.length > 0) {
  const css = cssFiles.map((f) => readFileSync(join(dist, f), 'utf8')).join('\n')
  bundle += `\n;/* SFC 样式内联注入（原生 ESM 不能 import CSS，模块求值时注入一次） */\n` +
    `if (typeof document !== 'undefined') {\n` +
    `  const el = document.createElement('style'); el.textContent = ${JSON.stringify(css)};\n` +
    `  document.head.appendChild(el);\n}\n`
  console.log(`=== CSS 内联（${cssFiles.join(', ')}） ===`)
}

// ---- 4. stored zip（与 plugins-selfcheck 的夹具写入器同款实现） ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(data) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function u16(v) { return [v & 0xff, (v >> 8) & 0xff] }
function u32(v) { return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff] }
function buildZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBytes = [...Buffer.from(name, 'utf8')]
    const dataBytes = [...data]
    const crc = crc32(data)
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...dataBytes,
    ]
    locals.push(...local)
    centrals.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset), ...nameBytes,
    )
    offset += local.length
  }
  return new Uint8Array([
    ...locals, ...centrals,
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(centrals.length), ...u32(offset), ...u16(0),
  ])
}

const outFile = outArg != null
  ? resolve(outArg)
  : join(root, 'build', 'plugins', `${manifest.id}-${manifest.version}.zip`)
mkdirSync(dirname(outFile), { recursive: true })
const zip = buildZip([
  { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
  { name: 'index.js', data: Buffer.from(bundle, 'utf8') },
])
writeFileSync(outFile, zip)
rmSync(tmp, { recursive: true, force: true })
console.log(`\n=== 产物：${outFile}（${statSync(outFile).size} 字节） ===`)
