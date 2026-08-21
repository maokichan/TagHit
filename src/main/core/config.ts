import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { AppConfig } from '@shared/types/config'
import { DEFAULT_CONFIG } from '@shared/types/config'

/**
 * ConfigService —— 首启生成默认 config.json，之后读写合并。
 * 配置即路由表：格式处理、排除规则、UI 设置都在这里，代码只负责执行。
 */
export class ConfigService {
  private config: AppConfig

  private constructor(private readonly file: string) {
    this.config = this.load()
  }

  static default(): ConfigService {
    return new ConfigService(join(app.getPath('userData'), 'config.json'))
  }

  private load(): AppConfig {
    let disk: Partial<AppConfig> = {}
    if (existsSync(this.file)) {
      try {
        disk = JSON.parse(readFileSync(this.file, 'utf-8')) as Partial<AppConfig>
      } catch (err) {
        console.error('[config] 解析失败，使用默认值', err)
      }
    }
    return { ...DEFAULT_CONFIG, ...disk, fileFormatMap: { ...DEFAULT_CONFIG.fileFormatMap, ...(disk.fileFormatMap ?? {}) }, tagDescriptions: { ...(disk.tagDescriptions ?? {}) } }
  }

  get(): AppConfig {
    return { ...this.config }
  }

  update(patch: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...patch }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8')
    return this.get()
  }
}
