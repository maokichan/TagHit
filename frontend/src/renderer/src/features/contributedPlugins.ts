/**
 * 三方插件装载与启停（D48：宿主端点驱动的运行时装载，DEV_PLUGINS 手工清单退役）。
 *
 * 装载管线只有一条：`api.plugins.list()`（宿主 = 装载事实权威，zip 校验通过才在列，
 * 错误条目如实带 error）→ 逐条注册（manifest 声明，source=contributed）→ 启用者激活。
 * 模块获取按**形态**分派（管线不分叉）：
 * - dev-source（仓库开发目录，仅 dev 态）：`/@fs/` 经 vite 即时编译——改插件源码刷新窗口即生效；
 * - bundle（用户安装位 {userData}/plugins/<id>）：`taghit-plugin:///` 模块协议——预构建
 *   ESM bundle，vue import 已在插件构建时重写到 `taghit-plugin:///__vendor/vue`
 *   （宿主共享模块，与壳同实例，见 vendor/vueVendor.ts 与 pluginProtocol）。
 *
 * **启动期激活是刻意的**：detailPreview 不挂任何停靠面，SurfaceHost 的惰性装载
 * （按挂载点渲染才 load）对纯预览贡献方永不触发——插件激活即注册其提供方，
 * 必须由本模块主动跑一次 loader。
 *
 * **启停（D43 修订）**：插件能力默认启用（安装即生效），但用户在插件面板可见、可停——
 * 停用 = 调激活清理函数（贡献摘除，内置预览自然兜底）+ 按 owner 清扫命令 + 关闭其自开页
 * 标签，**注册保留**（面板可见 + 再启用即重激活）；启用态持久化于 config
 * （`plugins:enabled:<featureId>`）。**插件永远不能悄悄接管：控制权在插件面板**。
 * 卸载/重装走完整摘除（含 unregisterFeature，registry 已备）。
 *
 * HostApi 兼容门（D48）：manifest.apiVersion 缺省视为兼容（dev 清单），声明超出宿主
 * HOST_API_VERSION 即拒绝激活并明示——additive 语义下插件面向旧版总是安全的。
 *
 * 失败可见（不再只进 console）：清单错误（宿主侧）与激活错误都进 loadErrors，
 * 管理页经 listInstallErrors 呈现。
 */

import { ref } from 'vue'
import { getFeature, registerContributedFeature, listContributedFeatures, unregisterFeature } from './registry'
import { createContributionContext, sweepContributions } from './contribution'
import type { PluginActivate } from './contribution'
import { HOST_API_VERSION } from './hostApi'
import { useConfigStore } from '../stores/config'
import { useTabStore } from '../stores/tab'
import { api } from '@shared/api'
import type { FeatureManifest } from '@shared/types/feature'
import type { PluginInstallEntry } from '@shared/contract'
import type { Component } from 'vue'

const config = useConfigStore()

const disposers = new Map<string, () => void>()

/** 装载错误（插件 id → 用户可见信息）：清单错误（宿主侧）与激活错误（渲染层）。 */
const loadErrors = ref(new Map<string, string>())

function setLoadError(id: string, message: string): void {
  const next = new Map(loadErrors.value)
  next.set(id, message)
  loadErrors.value = next
}

function clearLoadError(id: string): void {
  if (!loadErrors.value.has(id)) return
  const next = new Map(loadErrors.value)
  next.delete(id)
  loadErrors.value = next
}

/** 装载失败清单（管理页与错误条目合并呈现；与注册表互斥——失败者不在注册表里）。 */
export function listInstallErrors(): Array<{ id: string; error: string }> {
  return [...loadErrors.value].map(([id, error]) => ({ id, error }))
}

/** 插件启用态（默认启用；持久化于 config，插件面板可改）。 */
export function isPluginEnabled(featureId: string): boolean {
  return config.value('plugins', `enabled:${featureId}`, true)
}

/** 已装载插件清单（manifest + 启用态），插件面板消费。 */
export function listInstalledPlugins(): Array<{ manifest: FeatureManifest; enabled: boolean }> {
  return listContributedFeatures().map((f) => ({ manifest: f.manifest, enabled: isPluginEnabled(f.manifest.id) }))
}

/** HostApi 兼容门：required 缺省视为兼容（dev 清单）；数值段比较，超出宿主即 false。 */
function apiVersionOk(required: string | undefined): boolean {
  if (required == null) return true
  const parse = (v: string): number[] => v.split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : Number.NaN))
  const a = parse(required)
  const b = parse(HOST_API_VERSION)
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return true
}

/** 磁盘 manifest → 注册表 manifest（宿主已校验形状；mounts/surfaces 白名单在宿主侧收口）。 */
function manifestOf(m: NonNullable<PluginInstallEntry['manifest']>): Omit<FeatureManifest, 'source'> {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    mounts: (m.mounts ?? []) as FeatureManifest['mounts'],
    settings: m.settings as FeatureManifest['settings'],
    surfaces: m.surfaces as FeatureManifest['surfaces'],
    version: m.version,
    author: m.author,
    apiVersion: m.apiVersion,
  }
}

/** 模块地址：dev-source 走 vite /@fs/ 源码编译（仅 dev 态，宿主只在此形态给仓库目录）；bundle 走插件协议。 */
function moduleUrl(entry: PluginInstallEntry, m: NonNullable<PluginInstallEntry['manifest']>): string {
  if (entry.form === 'dev-source') {
    return `${location.origin}/@fs/${entry.dir.replaceAll('\\', '/')}/src/index.ts`
  }
  return `taghit-plugin://${m.id}/${m.main ?? 'index.js'}`
}

/** 完整摘除一个插件的运行时存在（卸载/重装前置）：清理函数 + 命令清扫 + 注册表移除。
 *  与"停用"不同——停用保留注册（面板可见），摘除连注册一起撤。previews 靠插件自己的
 *  清理函数（activate 返回的 dispose）摘除，同停用语义。 */
function removePluginRuntime(featureId: string): void {
  disposers.get(featureId)?.()
  disposers.delete(featureId)
  sweepContributions(featureId)
  unregisterFeature(featureId)
  const store = useTabStore()
  for (const t of [...store.tabs]) {
    if (t.kind === 'feature' && t.featureId === featureId) store.close(t.key)
  }
  clearLoadError(featureId)
}

/** 装载并激活单个清单条目（重装安全：同 id 先完整摘除旧存在再注册）。 */
async function activateEntry(entry: PluginInstallEntry): Promise<void> {
  const m = entry.manifest
  if (m == null) {
    setLoadError(entry.id, entry.error ?? '清单不可读')
    return
  }
  if (!apiVersionOk(m.apiVersion)) {
    setLoadError(m.id, `插件要求 HostApi ${m.apiVersion}，当前宿主 ${HOST_API_VERSION}`)
    return
  }
  const manifest = manifestOf(m)
  removePluginRuntime(manifest.id)
  try {
    // ctx 按插件独立创建（D46）：commands 槽的 id 前缀强制与 owner 记账以插件 id 为锚
    const ctx = createContributionContext(manifest.id)
    const url = moduleUrl(entry, m)
    const registered = registerContributedFeature(manifest, async () => {
      const mod = (await import(/* @vite-ignore */ url)) as { activate: PluginActivate; page?: Component }
      const dispose = mod.activate(ctx)
      if (typeof dispose === 'function') disposers.set(manifest.id, dispose)
      // 自开页（D47）：入口模块具名导出 page → 绑定为该插件的全页呈现
      return mod.page != null ? { fullPage: mod.page } : {}
    })
    if (!registered) return // 重复 id：注册表已拒绝并报告
    if (!isPluginEnabled(manifest.id)) return // 停用态：注册保底（面板可见），不激活
    const feature = getFeature(manifest.id)
    if (feature?.impl.type === 'async') await feature.impl.load()
    clearLoadError(manifest.id)
  } catch (error) {
    console.error(`[plugins] 激活失败（已跳过）：${manifest.id}`, error)
    removePluginRuntime(manifest.id)
    setLoadError(manifest.id, error instanceof Error ? error.message : String(error))
  }
}

/**
 * 装载全部插件（启动期与安装/卸载后的刷新共用同一条管线）：宿主清单 → 逐条注册 → 启用者激活。
 * 已不在清单里的运行时插件（被卸载）先完整摘除。
 */
export async function reloadPlugins(): Promise<void> {
  const { installs } = await api.plugins.list()
  const listed = new Set(installs.map((e) => e.manifest?.id ?? e.id))
  for (const f of listContributedFeatures()) {
    if (!listed.has(f.manifest.id)) removePluginRuntime(f.manifest.id)
  }
  for (const entry of installs) {
    await activateEntry(entry)
  }
}

/** 启停开关：停用 = 调清理函数（贡献摘除）+ 按 owner 清扫命令（D46 兜底，停用不得残留）
 *  + 关闭已打开的自开页标签（注册保留，面板仍可见）；启用 = 重新激活。 */
export async function setPluginEnabled(featureId: string, enabled: boolean): Promise<void> {
  config.setValue('plugins', `enabled:${featureId}`, enabled)
  disposers.get(featureId)?.()
  disposers.delete(featureId)
  sweepContributions(featureId)
  if (!enabled) {
    const store = useTabStore()
    for (const t of [...store.tabs]) {
      if (t.kind === 'feature' && t.featureId === featureId) store.close(t.key)
    }
    return
  }
  const entry = getFeature(featureId)
  if (entry?.impl.type === 'async') await entry.impl.load()
}

/** 卸载的渲染层侧：完整摘除运行时存在（磁盘删除由宿主端点完成）。 */
export function removePlugin(featureId: string): void {
  removePluginRuntime(featureId)
}
