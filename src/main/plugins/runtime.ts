import { readFile, readdir } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { PluginManifest } from '@shared/types/plugin'

const execFileAsync = promisify(execFile)

/** 插件运行时上下文：按清单声明式权限，暴露受限的 Node API */
export interface PluginContext {
  name: string
  log: (msg: string) => void
  /** permissions.fs=true 时可用：只读文件 API */
  fs?: {
    readFile: (path: string, encoding?: BufferEncoding) => Promise<string>
    readdir: (path: string) => Promise<string[]>
  }
  /** permissions.network=true 时可用：全局 fetch */
  fetch?: typeof fetch
  /** permissions.shell=true 时可用：受限子进程（仅返回 stdout/stderr） */
  execFile?: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
}

export interface PluginExports {
  tools?: Record<string, (args: unknown) => unknown | Promise<unknown>>
  onEvent?: (event: string, payload: unknown) => void | Promise<void>
}

/**
 * 根据清单构建权限受限的上下文。
 * 原则：插件能力 = 权限清单 ∩ 宿主白名单；JSON 永远只是数据，代码与数据边界不模糊。
 */
export function createPluginContext(name: string, manifest: PluginManifest): PluginContext {
  const permissions = manifest.permissions ?? {}
  const ctx: PluginContext = { name, log: (msg) => console.log(`[plugin:${name}]`, msg) }

  if (permissions.fs) {
    ctx.fs = {
      readFile: (path, encoding = 'utf-8') => readFile(path, encoding),
      readdir: (path) => readdir(path)
    }
  }

  if (permissions.network) {
    ctx.fetch = (input, init) => fetch(input, init)
  }

  if (permissions.shell) {
    ctx.execFile = (command, args) => execFileAsync(command, args, { timeout: 10_000 })
  }

  return ctx
}
