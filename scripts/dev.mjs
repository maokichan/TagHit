// 一键开发启动：bundle:host（一次性打包）→ 并行 dev:renderer（vite 5173）+ start:host（Electron）。
// 环境变量透传：TAGHIT_RENDERER_URL 缺省 http://localhost:5173；TAGHIT_DB 缺省 build/taghit-dev.db。
import { spawn } from 'node:child_process'

// Windows 下直接 spawn npm.cmd 会 EINVAL（.cmd 需经 cmd.exe 包装），故统一走 shell。
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = new Set()

function run(args, opts = {}) {
  const child = spawn([npmCmd, ...args].join(' '), { stdio: 'inherit', shell: true, ...opts })
  children.add(child)
  child.on('exit', (code, signal) => {
    children.delete(child)
    console.log(`[dev] ${args.join(' ')} 退出（${signal ?? code}）`)
    if (children.size > 0) shutdown()
    else process.exit(0)
  })
  return child
}

function shutdown() {
  for (const c of children) {
    if (c.exitCode === null && !c.killed) c.kill()
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

const bundle = spawn([npmCmd, 'run', 'bundle:host'].join(' '), { stdio: 'inherit', shell: true })
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
