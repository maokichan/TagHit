// 一键开发启动：bundle:host（一次性打包）→ 并行 dev:renderer（vite，端口自适应）+ start:host（Electron）。
// 环境变量透传：TAGHIT_RENDERER_URL 缺省 http://localhost:<首选空闲端口>；TAGHIT_DB 缺省 build/taghit-dev.db。
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

// Windows 下直接 spawn npm.cmd 会 EINVAL（.cmd 需经 cmd.exe 包装），故统一走 shell。
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = new Set()
let shuttingDown = false

/** 端口在 127.0.0.1 与 ::1 上都空闲才算可用（vite localhost 双栈监听）。 */
function portFree(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const srv = createServer()
      srv.once('error', () => resolve(false))
      srv.once('listening', () => srv.close(() => resolve(true)))
      srv.listen(port, host)
    })
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then(([a, b]) => a && b)
}

async function pickPort() {
  // 5173 被占（上一场次的孤儿 vite 等）→ 自增回退，Electron 侧同步指向实际端口
  let port = 5173
  while (!(await portFree(port))) port++
  return port
}

function run(args, opts = {}) {
  // raw: true = 直接执行命令（不经 npm run 包装——嵌套 npm 会吞掉传给 vite 的 --port）
  const cmd = opts.raw === true ? args.join(' ') : [npmCmd, ...args].join(' ')
  const child = spawn(cmd, {
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
    ...opts,
  })
  children.add(child)
  child.on('exit', (code, signal) => {
    children.delete(child)
    console.log(`[dev] ${opts.raw === true ? args[1] : args.join(' ')} 退出（${signal ?? code}）`)
    if (shuttingDown) {
      if (children.size === 0) process.exit(0)
      return
    }
    // 任一子进程退出即收场：electron 关窗退出 → 停 vite；vite 挂掉 → 停 electron
    shuttingDown = true
    shutdown()
    // 兜底：进程树 5s 内未全部退出则强制收场
    setTimeout(() => process.exit(0), 5000).unref()
  })
  return child
}

/** 树杀：Windows 下 kill() 只终止 cmd.exe 包装层，vite/electron 孙进程会变孤儿（占端口/挂住终端）。 */
function killTree(child) {
  if (child.pid == null || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  } else {
    child.kill('SIGTERM')
  }
}

function shutdown() {
  for (const c of children) killTree(c)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

const bundle = spawn([npmCmd, 'run', 'bundle:host'].join(' '), {
  stdio: 'inherit',
  shell: true,
  windowsHide: true,
})
bundle.on('exit', async (code) => {
  if (code !== 0) {
    console.error('[dev] bundle:host 失败，终止。')
    process.exit(code ?? 1)
  }
  const port = await pickPort()
  if (port !== 5173) console.log(`[dev] 5173 被占用，vite 回退到 ${port}`)
  // 直接拉 vite（不经 npm run：嵌套 npm 会吞 --port）；cwd=frontend 使 config 相对路径成立
  run(['node', 'node_modules/vite/bin/vite.js', '--config', 'vite.renderer.config.ts', '--port', String(port), '--strictPort'], {
    raw: true,
    cwd: 'frontend',
  })
  run(['run', 'start:host'], {
    env: {
      ...process.env,
      TAGHIT_RENDERER_URL: process.env.TAGHIT_RENDERER_URL ?? `http://localhost:${port}`,
      TAGHIT_DB: process.env.TAGHIT_DB ?? 'build/taghit-dev.db',
    },
  })
})
