/**
 * 插件安装位（D48 插件分发 v1）：zip 导入 / 清单 / 卸载的宿主纯逻辑模块。
 *
 * 零 electron 依赖（node:fs/promises + extract-zip/yauzl），scripts/plugins-selfcheck.ts
 * 可 node 直验——与 src/host/diagnostics.ts 同款纪律。装载激活在渲染层
 * （contributedPlugins.ts），本模块是**装载事实的唯一权威**：zip 校验通过才落位，
 * 渲染层只信这里给出的清单。
 *
 * 安装位形态（两根，同一清单模型）：
 * - dev-source：仓库开发目录（TAGHIT_PLUGINS_DIR 缺省 <repo>/plugins，仅 dev 态进清单）
 *   —— 模块获取走 vite（/@fs/ 源码编译），不为本协议服务，故不要求目录名 = id；
 * - bundle：用户安装位 {userData}/plugins/<id>/（zip 解包落位）—— 模块获取走
 *   taghit-plugin:// 协议，协议按 id 寻址，故**目录名必须 = manifest.id**。
 *
 * 安全边界：
 * - id 字符集门（^ [A-Za-z0-9][A-Za-z0-9_-]* $）：id 即目录名与协议寻址段，`__vendor`
 *   保留命名空间（下划线开头非法）天然拒绝；
 * - zip 预检（yauzl 读中央目录）：条目数与解压总量上限 + yauzl 内建文件名校验
 *   （`\`、`..` 段、绝对路径、盘符一律报错）——路径穿越在解包前拒绝；
 * - 覆盖安装 = 删旧目录 + rename（落点由 id 字符集保证在安装位一层，无相对段可达）。
 */

import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { join, normalize, relative, sep } from 'node:path'
import { open as yauzlOpen } from 'yauzl'
import type { InstallForm, PluginInstallEntry, PluginManifestFile } from './ipc.ts'

/** 与渲染层 features/hostApi.ts 的 HOST_API_VERSION 同值互指（additive 升级两处同升）。 */
export const HOST_PLUGIN_API_VERSION = '0.2.4'

/** zip 解包上限：防 zip 炸弹（总量 64MiB / 条目 2000）。 */
const MAX_TOTAL_UNCOMPRESSED = 64 * 1024 * 1024
const MAX_ENTRIES = 2000

/** 挂载点白名单（与 shared/types/feature.ts 的 MountPoint 非 v2 预留项一致）。 */
const MOUNT_POINTS = ['activityBar:left', 'displayPanel', 'settings', 'contentTab', 'detailView'] as const
/** 所需壳服务白名单（同文件 surfaces；v0 仅声明不校验）。 */
const SURFACES = ['dialog', 'toast'] as const

/** id = 目录名 = 协议寻址段：字符集即安全边界；`__vendor` 保留（下划线开头非法）。 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

// ---- manifest 校验（readInstalls 与 installZip 共用同一条规则，不各写一份） ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 语义版本段比较（x.y.z 数值逐段，短段补 0）：a ≤ b 为 true。 */
export function apiVersionAtMost(a: string, b: string): boolean {
  const parse = (v: string): number[] =>
    v.split('.').map((s) => ( /^\d+$/.test(s) ? Number(s) : NaN ))
  const pa = parse(a)
  const pb = parse(b)
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN) || pa.length === 0 || pb.length === 0) return false
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y
  }
  return true
}

/**
 * 校验磁盘 manifest（解析后的 JSON 对象）。
 * distribution = true 时 version/apiVersion 必填（zip 安装路径）；dev-source 清单可缺。
 * 校验失败抛 Error（message 用户可见）。
 */
export function validateManifest(raw: unknown, distribution: boolean): PluginManifestFile {
  if (!isRecord(raw)) throw new Error('manifest.json 不是 JSON 对象')
  const id = raw.id
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error(`manifest.id 缺失或含非法字符（${String(id)}）——只允许字母数字与 _-，且不以下划线开头`)
  }
  if (typeof raw.title !== 'string' || raw.title === '') throw new Error('manifest.title 缺失')
  const m: PluginManifestFile = { id, title: raw.title }
  if (raw.description != null) {
    if (typeof raw.description !== 'string') throw new Error('manifest.description 必须是字符串')
    m.description = raw.description
  }
  if (raw.version != null) {
    if (typeof raw.version !== 'string') throw new Error('manifest.version 必须是字符串')
    m.version = raw.version
  } else if (distribution) {
    throw new Error('manifest.version 缺失——zip 分发必须自带版本号（D48）')
  }
  if (raw.author != null) {
    if (typeof raw.author !== 'string') throw new Error('manifest.author 必须是字符串')
    m.author = raw.author
  }
  if (raw.apiVersion != null) {
    if (typeof raw.apiVersion !== 'string' || !apiVersionAtMost(raw.apiVersion, raw.apiVersion)) {
      throw new Error('manifest.apiVersion 必须是 x.y.z 形式的版本号')
    }
    m.apiVersion = raw.apiVersion
  } else if (distribution) {
    throw new Error(`manifest.apiVersion 缺失——zip 分发必须声明面向的 HostApi 版本（当前宿主 ${HOST_PLUGIN_API_VERSION}）`)
  }
  if (raw.main != null) {
    if (typeof raw.main !== 'string' || raw.main === '' || raw.main.includes('\\') ||
        raw.main.startsWith('/') || raw.main.split('/').includes('..')) {
      throw new Error('manifest.main 必须是包内的相对路径（不允许反斜杠与 .. 段）')
    }
    m.main = raw.main
  }
  if (raw.mounts != null) {
    if (!Array.isArray(raw.mounts) || raw.mounts.some((x) => !MOUNT_POINTS.includes(x as (typeof MOUNT_POINTS)[number]))) {
      throw new Error(`manifest.mounts 只允许 ${MOUNT_POINTS.join(' / ')}`)
    }
    m.mounts = raw.mounts as string[]
  }
  if (raw.surfaces != null) {
    if (!Array.isArray(raw.surfaces) || raw.surfaces.some((x) => !SURFACES.includes(x as (typeof SURFACES)[number]))) {
      throw new Error(`manifest.surfaces 只允许 ${SURFACES.join(' / ')}`)
    }
    m.surfaces = raw.surfaces as string[]
  }
  if (raw.settings != null) {
    if (!Array.isArray(raw.settings) || raw.settings.some((s) => !isRecord(s) || typeof s.key !== 'string' || typeof s.label !== 'string' || typeof s.type !== 'string')) {
      throw new Error('manifest.settings 必须是 { key, label, type, ... } 对象数组')
    }
    m.settings = raw.settings
  }
  return m
}

/** 该绝对路径是否在 root 之内（路径段匹配；normalize 已解析相对段，此处防同前缀兄弟目录）。 */
function isUnderDir(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith('..') && !rel.split(sep).includes('..')
}

// ---- 清单（两个安装位根合并出一份；错误条目如实呈现不静默吞） ----

async function readOneInstall(dir: string, form: InstallForm): Promise<PluginInstallEntry> {
  const id = dir.split(sep).pop() ?? dir
  const base: PluginInstallEntry = { id, dir, form, manifest: null, error: null }
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  } catch (error) {
    base.error = `manifest.json 不可读：${error instanceof Error ? error.message : String(error)}`
    return base
  }
  try {
    const manifest = validateManifest(raw, false)
    if (form === 'bundle' && manifest.id !== id) {
      throw new Error(`manifest.id（${manifest.id}）与目录名（${id}）不一致——安装位按 id 寻址`)
    }
    if (form === 'bundle') {
      const entryFile = join(dir, manifest.main ?? 'index.js')
      const st = await stat(entryFile).catch(() => null)
      if (st == null || !st.isFile()) {
        throw new Error(`入口模块缺失（${manifest.main ?? 'index.js'}）——zip 需包含预构建的 ESM bundle`)
      }
    } else {
      // dev-source：约定入口 = <dir>/src/index.ts（与历史 DEV_PLUGINS 形态一致）
      const st = await stat(join(dir, 'src', 'index.ts')).catch(() => null)
      if (st == null || !st.isFile()) throw new Error('开发插件入口缺失（src/index.ts）')
    }
    base.manifest = manifest
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error)
  }
  return base
}

/** 扫安装位根出清单：dev 根在前、用户安装位在后（同 id 时后注册覆盖先注册 = 用户安装生效）。 */
export async function listInstalls(roots: Array<{ root: string; form: InstallForm }>): Promise<PluginInstallEntry[]> {
  const entries: PluginInstallEntry[] = []
  for (const { root, form } of roots) {
    let dirents
    try {
      dirents = await readdir(root, { withFileTypes: true })
    } catch {
      continue // 根不存在（从未安装过/无开发目录）= 空清单，不是错误
    }
    for (const d of dirents) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue
      entries.push(await readOneInstall(join(root, d.name), form))
    }
  }
  return entries
}

/** 解包到临时目录并定位包根 + 按 zip 分发口径校验 manifest（install 与 peek 共用，不各写一份）。
 *  临时目录随返回值交调用方清理（peek 读完即删、install rename 后清余壳）。 */
async function extractAndValidate(zipPath: string, installsRoot: string): Promise<{ tmp: string; pkgRoot: string; manifest: PluginManifestFile }> {
  await stat(zipPath).catch(() => {
    throw new Error(`插件包不存在（${zipPath}）`)
  })
  await precheckZip(zipPath)
  await mkdir(installsRoot, { recursive: true })
  const tmp = join(installsRoot, `.tmp-install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  await rm(tmp, { recursive: true, force: true })
  try {
    await extractZip(zipPath, tmp)
    // 包根定位：manifest.json 在解包根；或唯一一级目录内有 manifest.json（打包器常套一层目录）
    let pkgRoot = tmp
    if (!(await stat(join(tmp, 'manifest.json')).catch(() => null))?.isFile()) {
      const children = (await readdir(tmp, { withFileTypes: true })).filter((d) => !d.name.startsWith('.'))
      const dirs = children.filter((d) => d.isDirectory())
      if (dirs.length === 1 && (await stat(join(tmp, dirs[0].name, 'manifest.json')).catch(() => null))?.isFile()) {
        pkgRoot = join(tmp, dirs[0].name)
      } else {
        throw new Error('插件包根缺 manifest.json——包内应有 manifest.json（或包成单层目录）')
      }
    }
    let manifestRaw: unknown
    try {
      manifestRaw = JSON.parse(await readFile(join(pkgRoot, 'manifest.json'), 'utf8'))
    } catch (error) {
      throw new Error(`manifest.json 不是合法 JSON（${error instanceof Error ? error.message : String(error)}）`)
    }
    const manifest = validateManifest(manifestRaw, true)
    if (!apiVersionAtMost(manifest.apiVersion ?? HOST_PLUGIN_API_VERSION, HOST_PLUGIN_API_VERSION)) {
      throw new Error(`插件要求 HostApi ${manifest.apiVersion}，当前宿主 ${HOST_PLUGIN_API_VERSION}——请升级 TagHit 后再安装`)
    }
    const entryStat = await stat(join(pkgRoot, manifest.main ?? 'index.js')).catch(() => null)
    if (entryStat == null || !entryStat.isFile()) {
      throw new Error(`入口模块缺失（${manifest.main ?? 'index.js'}）——zip 需包含预构建的 ESM bundle`)
    }
    return { tmp, pkgRoot, manifest }
  } catch (error) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

/** 预检读包（不落位）：安装确认页在用户拍板前展示身份事实；conflict = 同 id 已安装（将覆盖）。 */
export async function peekZip(zipPath: string, installsRoot: string): Promise<{ manifest: PluginManifestFile; conflict: boolean }> {
  const { tmp, manifest } = await extractAndValidate(zipPath, installsRoot)
  try {
    const conflict = (await stat(join(installsRoot, manifest.id)).catch(() => null))?.isDirectory() === true
    return { manifest, conflict }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

/** yauzl 中央目录预检：条目数/解压总量上限 + 文件名合法性（`\`、`..` 段、绝对路径、盘符在此拒绝）。 */
function precheckZip(zipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzlOpen(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err != null || zipfile == null) {
        reject(new Error(`插件包不是有效的 zip 文件（${err instanceof Error ? err.message : '未知错误'}）`))
        return
      }
      let total = 0
      let count = 0
      zipfile.on('error', (e) => {
        zipfile.close()
        // yauzl 文件名校验（`\`、`..` 段、绝对路径、盘符）都走这里：穿越即"不安全"
        reject(new Error(`插件包不安全或不可读（${e.message}）`))
      })
      zipfile.on('entry', (entry) => {
        count++
        total += entry.uncompressedSize
        if (count > MAX_ENTRIES || total > MAX_TOTAL_UNCOMPRESSED) {
          zipfile.close()
          reject(new Error('插件包超出上限（条目 2000 或解压总量 64MiB）'))
          return
        }
        zipfile.readEntry()
      })
      zipfile.on('end', () => {
        zipfile.close()
        resolve()
      })
      zipfile.readEntry()
    })
  })
}

/** extract-zip 动态引入（CJS 互操作壳）：node 直验与 esbuild bundle 两条运行路同形。 */
async function extractZip(zipPath: string, dir: string): Promise<void> {
  const mod = (await import('extract-zip')) as unknown as {
    default: (zipPath: string, opts: { dir: string }) => Promise<void>
  }
  await mod.default(zipPath, { dir })
}

/**
 * 安装（更新 = 同 id 覆盖，D48）：预检 → 解包到临时目录 → 定位包根 → manifest 校验
 * （zip 分发口径：version/apiVersion 必填、入口在场、apiVersion ≤ 宿主现值）→
 * 目标已存在则先删 → rename 落位。返回 { manifest, replaced }。
 */
export async function installZip(zipPath: string, installsRoot: string): Promise<{ manifest: PluginManifestFile; replaced: boolean }> {
  const { tmp, pkgRoot, manifest } = await extractAndValidate(zipPath, installsRoot)
  try {
    const target = join(installsRoot, manifest.id)
    if (!isUnderDir(installsRoot, target)) throw new Error(`安装落点越界（${manifest.id}）`)
    let replaced = false
    if (await stat(target).catch(() => null)) {
      replaced = true
      await rm(target, { recursive: true, force: true })
    }
    await rename(pkgRoot, target)
    return { manifest, replaced }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

// ---- 卸载 ----

/** 卸载 = 删安装目录（可重装，不做回收站，D48）；贡献清扫归渲染层停用语义。 */
export async function uninstallPlugin(id: string, installsRoot: string): Promise<void> {
  if (!ID_PATTERN.test(id)) throw new Error(`非法插件 id（${id}）`)
  const target = normalize(join(installsRoot, id))
  if (!isUnderDir(installsRoot, target)) throw new Error(`卸载落点越界（${id}）`)
  const st = await stat(target).catch(() => null)
  if (st == null || !st.isDirectory()) throw new Error(`插件未安装或已卸载（${id}）`)
  await rm(target, { recursive: true, force: true })
}
