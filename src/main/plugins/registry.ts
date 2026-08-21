import { createRequire } from 'module'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import type { PluginManifest } from '@shared/types/plugin'

/**
 * 插件清单加载器：扫描插件目录，读取并校验 plugin.json。
 * 目录约定：
 *  - 内置：resources/plugins/<name>/plugin.json
 *  - 用户：userData/plugins/<name>/plugin.json（同名覆盖内置）
 */

export interface LoadedPlugin {
  name: string
  manifest: PluginManifest
  dir: string
}

function readManifest(dir: string): PluginManifest | null {
  const file = join(dir, 'plugin.json')
  if (!existsSync(file)) return null
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<PluginManifest>
    if (typeof raw.name !== 'string' || raw.name.length === 0) return null
    if (typeof raw.entry !== 'string' || raw.entry.length === 0) return null
    return {
      name: raw.name,
      version: raw.version ?? '0.0.0',
      description: raw.description,
      entry: raw.entry,
      permissions: raw.permissions
    }
  } catch {
    return null
  }
}

export function scanPluginDir(baseDir: string): LoadedPlugin[] {
  if (!existsSync(baseDir)) return []
  const result: LoadedPlugin[] = []
  for (const name of readdirSync(baseDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const dir = join(baseDir, name.name)
    const manifest = readManifest(dir)
    if (manifest) result.push({ name: manifest.name, manifest, dir })
  }
  return result
}

/** 校验入口路径不越出插件目录（防目录穿越） */
export function resolveEntry(pluginDir: string, entry: string): string {
  const target = resolve(pluginDir, entry)
  if (!isAbsolute(target) || !target.startsWith(resolve(pluginDir))) {
    throw new Error(`非法插件入口路径: ${entry}`)
  }
  return target
}

/** CJS 加载（插件为普通 Node 模块，可访问完整 Node API 范围由权限清单控制） */
export function loadPluginModule(entryPath: string): unknown {
  const require = createRequire(join(entryPath, 'noop.cjs'))
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(entryPath)
}
