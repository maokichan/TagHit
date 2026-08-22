import { app } from 'electron'
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Logger —— 主进程日志服务（分级 + 文件滚动 + 控制台）。
 * 输出：控制台（dev 可见）+ {userData}/logs/taghit.log（按大小滚动，保留最近 MAX_FILES 份）。
 * 设计：懒初始化（首次写入时建目录），日志失败静默（日志不能成为故障源）。
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MAX_SIZE = 1 * 1024 * 1024 // 单文件 1MB 滚动
const MAX_FILES = 5 // 保留 taghit.log + taghit.1.log ... taghit.4.log

function fmtArg(a: unknown): string {
  try {
    if (typeof a === 'string') return a
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

export class Logger {
  private level: LogLevel = 'info'
  private dir: string | null = null
  private file: string | null = null
  private size = 0

  setLevel(level: LogLevel): void {
    this.level = level
  }

  private ensure(): void {
    if (this.file) return
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    this.dir = dir
    this.file = join(dir, 'taghit.log')
    this.size = existsSync(this.file) ? statSync(this.file).size : 0
  }

  /** 超限滚动：taghit.log → taghit.1.log → ... → taghit.(MAX_FILES-1).log（最旧丢弃） */
  private rotate(): void {
    if (!this.dir || !this.file || this.size < MAX_SIZE) return
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const from = join(this.dir, `taghit.${i - 1}.log`)
      const to = join(this.dir, `taghit.${i}.log`)
      if (existsSync(from)) renameSync(from, to)
    }
    renameSync(this.file, join(this.dir, 'taghit.1.log'))
    this.size = 0
  }

  write(level: LogLevel, source: string, message: string, ...args: unknown[]): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return
    const detail = args.length > 0 ? ' ' + args.map(fmtArg).join(' ') : ''
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${source}] ${message}${detail}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
    try {
      this.ensure()
      this.rotate()
      writeFileSync(this.file as string, line + '\n', { flag: 'a' })
      this.size += line.length + 1
    } catch {
      // 日志写入失败静默，不影响主流程
    }
  }

  debug(source: string, message: string, ...args: unknown[]): void {
    this.write('debug', source, message, ...args)
  }
  info(source: string, message: string, ...args: unknown[]): void {
    this.write('info', source, message, ...args)
  }
  warn(source: string, message: string, ...args: unknown[]): void {
    this.write('warn', source, message, ...args)
  }
  error(source: string, message: string, ...args: unknown[]): void {
    this.write('error', source, message, ...args)
  }
}

/** 全局单例（主进程各域共用） */
export const logger = new Logger()
