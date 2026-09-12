// 一键开发启动：bundle:host（一次性打包）→ 并行 dev:renderer（vite 5173）+ start:host（Electron）。
// 环境变量透传：TAGHIT_RENDERER_URL 缺省 http://localhost:5173；TAGHIT_DB 缺省 build/taghit-dev.db。
import { spawn } from 'node:child_process'

// Windows 下直接 spawn npm.cmd 会 EINVAL（.cmd 需经 cmd.exe 包装），故统一走 shell。
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = new Set()
let shuttingDown = false

function run(args, opts = {}) {
  const child = spawn([npmCmd, ...args].join(' '), {
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
    ...opts,
  })
  children.add(child)
  child.on('exit', (code, signal) => {
    children.delete(child)
    console.log(`[dev] ${args.join(' ')} 退出（${signal ?? code}）`)
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
bundle.on('exit', (code) => {
  if (code !== 0) {
    console.error('[dev] bundle:host 失败，终止。')
    process.exit(code ?? 1)
  }
  run(['run', 'dev:renderer'])
  run(['run', 'start:host'], {
    env: {
      ...process.env,
      TAGHIT_RENDERER_URL: process.env.TAGHIT_RENDERER_URL ?? 'http://localhost:5173',
      TAGHIT_DB: process.env.TAGHIT_DB ?? 'build/taghit-dev.db',
    },
  })
})
