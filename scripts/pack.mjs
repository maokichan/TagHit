/**
 * 便携 zip 装配线（v0.3.0 打包，TODO 工程化；命令唯一描述 = AGENTS §三 `npm run pack`）：
 * 1. bundle:host —— esbuild 打 src/host → build/main.cjs + preload.cjs（external: electron/better-sqlite3）
 * 2. 渲染层构建 —— vite（base './'，file:// 可用；产物 src/renderer/dist）
 * 3. 阶段归置 —— 渲染层 dist → 根 renderer-dist/（与 main.cjs 同入 asar）
 * 4. electron-builder（win zip）—— cwd 必须 = 仓库根（版本号唯一归口 = 根 package.json），
 *    借用 frontend 已装的 electron-builder（根 node_modules 是 ABI 红线区，不新增安装）
 *
 * 产物：release/TagHit-<version>-win.zip（gitignore，不入库）。
 * 真机验证 = 无 Node 机器解压双击（better-sqlite3 的 ABI 坑只有真机兜得住）。
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const step = (name, cmd, args) => {
  console.log(`\n=== ${name} ===`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    console.error(`[pack] 步骤失败：${name}`)
    process.exit(r.status ?? 1)
  }
}

step('bundle:host', 'npm', ['run', 'bundle:host'])
step('渲染层构建', 'npm', ['--prefix', 'frontend', 'run', 'check:build'])

const dist = join(root, 'frontend/src/renderer/dist')
if (!existsSync(join(dist, 'index.html'))) {
  console.error('[pack] 渲染层产物缺失（frontend/src/renderer/dist/index.html）——构建步骤未生效？')
  process.exit(1)
}
rmSync(join(root, 'renderer-dist'), { recursive: true, force: true })
cpSync(dist, join(root, 'renderer-dist'), { recursive: true })
console.log('\n=== 阶段归置：renderer-dist 就绪 ===')

step('electron-builder (win zip)', 'node', [
  'frontend/node_modules/electron-builder/cli.js',
  '--win',
  '--config',
  'electron-builder.yml',
])
