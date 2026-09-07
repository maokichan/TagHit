import type { Component } from 'vue'
import { FolderOpen, Info, Puzzle, SlidersHorizontal, Tags } from 'lucide-vue-next'
import type { FeatureManifest, FeatureSource, MountPoint } from '@shared/types/feature'
import MediaTypeFeature from './display/mediaType/MediaTypeFeature.vue'
import SortFeature from './display/sort/SortFeature.vue'
import LayoutFeature from './display/layout/LayoutFeature.vue'
import WorkspaceInfoFeature from './display/workspaceInfo/WorkspaceInfoFeature.vue'
import PathsPanel from '../components/workspace/PathsPanel.vue'
import TagsPanel from '../components/workspace/TagsPanel.vue'
import DisplayPanel from '../components/workspace/DisplayPanel.vue'
import InfoPanel from '../components/layout/InfoPanel.vue'
import PluginsPanel from '../components/layout/PluginsPanel.vue'
import { setupKeyboardMouse } from './keyboardMouse/setup'

/** 行为注册钩子：返回清理函数则由壳在卸载时执行（事件订阅必须可退订）。 */
export type SetupHook = () => void | (() => void)

/**
 * 实现绑定（渲染层关注点，不进 manifest）——按来源分层，机制同构：
 * - official：构建期直连（静态 import，随壳同版本发布）；
 * - contributed：运行期 loader（声明先到、实现后到；权限门/错误隔离届时接在这层）。
 * 同构验收：任一官方组件的 impl 换成 load 形态后壳行为不变（ARCHITECTURE §3.1）。
 */
export type FeatureImpl =
  // component 可选：仅设置页的功能组件（如 showTitles）无面板 UI
  | { source: 'official'; component?: Component; icon?: Component; setup?: SetupHook }
  | { source: 'contributed'; load: () => Promise<{ component: Component; setup?: SetupHook }> }

/** 注册表条目 = 可序列化声明 + 实现绑定。声明表是壳的唯一查询面。 */
export interface FeatureEntry {
  manifest: FeatureManifest
  impl: FeatureImpl
}

const registry = new Map<string, FeatureEntry>()

/** per-entry 行为清理函数：单组件卸载与全量 dispose 都从这里走（生命周期分层，全局批量退役）。 */
const disposers = new Map<string, () => void>()

/**
 * 注册一个功能组件。重复 id 抛错——官方静态注册期望开发期暴露；
 * contributed 源的重复 id 届时在动态装载处降级为"拒绝该插件并报告"，不炸注册流程。
 */
export function registerFeature(manifest: FeatureManifest, impl: FeatureImpl): void {
  if (registry.has(manifest.id)) {
    throw new Error(`功能组件 id 重复：${manifest.id}`)
  }
  registry.set(manifest.id, { manifest, impl })
}

/** 移除单个组件：先执行其行为清理再出表（三方启停/卸载的机制承载；官方 v0 不调用）。 */
export function unregisterFeature(id: string): void {
  const dispose = disposers.get(id)
  if (dispose) {
    try {
      dispose()
    } catch (e) {
      console.error(`[features] ${id} dispose 失败`, e)
    }
  }
  disposers.delete(id)
  registry.delete(id)
}

export function getFeature(id: string): FeatureEntry | undefined {
  return registry.get(id)
}

export function listFeatures(mount: MountPoint): FeatureEntry[] {
  return [...registry.values()].filter((f) => f.manifest.mounts.includes(mount))
}

/** 槽渲染取实现：contributed 未解析时返回 undefined——槽渲染处需处理该态（v0 仅官方，恒有值）。 */
export function resolvedComponent(entry: FeatureEntry): Component | undefined {
  return entry.impl.source === 'official' ? entry.impl.component : undefined
}

/** 活动栏图标（渲染层关注点，不进 manifest）。 */
export function resolvedIcon(entry: FeatureEntry): Component | undefined {
  return entry.impl.source === 'official' ? entry.impl.icon : undefined
}

/**
 * 执行单个组件的行为钩子（错误隔离：一个 setup 抛错只废掉自己，不炸注册流程与其余组件；
 * 官方组件同样过此边界——同构验收的一部分）。幂等：已 setup 的条目跳过。
 */
export function setupFeature(entry: FeatureEntry): void {
  if (entry.impl.source !== 'official' || entry.impl.setup == null) return
  if (disposers.has(entry.manifest.id)) return
  try {
    const d = entry.impl.setup()
    if (typeof d === 'function') disposers.set(entry.manifest.id, d)
  } catch (e) {
    console.error(`[features] ${entry.manifest.id} setup 失败（已隔离，组件继续渲染）`, e)
  }
}

/** 全部已注册组件执行行为钩子（官方启动路径：mount 后调用一次）。 */
export function setupFeatureBehaviors(): void {
  for (const entry of registry.values()) setupFeature(entry)
}

/** 全量清理（幂等）：逐条执行 per-entry 清理函数，单条失败不阻断其余。 */
export function disposeFeatureBehaviors(): void {
  for (const [id, dispose] of disposers) {
    try {
      dispose()
    } catch (e) {
      console.error(`[features] ${id} dispose 失败`, e)
    }
  }
  disposers.clear()
}

/** 官方组件注册（静态可信，构建期直连）：manifest 缺省 source=official。 */
function official(
  manifest: Omit<FeatureManifest, 'source'> & { source?: FeatureSource },
  impl: Omit<Extract<FeatureImpl, { source: 'official' }>, 'source'>
): void {
  registerFeature(
    { ...manifest, source: manifest.source ?? 'official' },
    { source: 'official', ...impl }
  )
}

/** 应用启动时注册全部官方功能组件（声明表先于 app.mount 装载——App.vue 挂载时读表）。 */
export function registerBuiltinFeatures(): void {
  // ── 左活动栏工具（壳的默认顺序，用户可拖拽重排——App.vue 持久化） ──
  official(
    { id: 'paths', title: '路径', mounts: ['activityBar:left'] },
    { icon: FolderOpen, component: PathsPanel }
  )
  official(
    { id: 'tags', title: '标签', mounts: ['activityBar:left'] },
    { icon: Tags, component: TagsPanel }
  )
  official(
    { id: 'display', title: '显示', mounts: ['activityBar:left'] },
    { icon: SlidersHorizontal, component: DisplayPanel }
  )

  // ── 右活动栏工具 ──
  official(
    { id: 'info', title: '媒体信息', mounts: ['activityBar:right'] },
    { icon: Info, component: InfoPanel }
  )
  official(
    { id: 'plugins', title: '插件', mounts: ['activityBar:right'] },
    { icon: Puzzle, component: PluginsPanel }
  )

  // ── 显示面板区块 ──
  official(
    {
      id: 'mediaTypeFilter',
      title: '媒体类型',
      mounts: ['displayPanel'],
      dataSource: 'fileFormatMap'
    },
    { component: MediaTypeFeature }
  )
  official(
    {
      id: 'sort',
      title: '排序',
      mounts: ['displayPanel'],
      dataSource: 'sortKeys'
    },
    { component: SortFeature }
  )
  official(
    {
      id: 'layout',
      title: '布局',
      mounts: ['displayPanel', 'settings'],
      settings: [
        {
          key: 'layoutMode',
          type: 'enum',
          label: '网格布局',
          options: [
            { value: 'masonry', label: '瀑布流' },
            { value: 'grid', label: '网格' },
            { value: 'list', label: '列表' }
          ],
          default: 'masonry'
        }
      ]
    },
    { component: LayoutFeature }
  )
  // 贡献点 v0 垂直切片：消费 HostApi（listRoots/declaredTags）的官方组件
  official(
    { id: 'workspaceInfo', title: '工作区信息', mounts: ['displayPanel'] },
    { component: WorkspaceInfoFeature }
  )

  // ── 仅设置页 ──
  official(
    {
      id: 'showTitles',
      title: '卡片标题',
      // 按用户决策（2026-08-23）：不出现在活动栏功能组件实例，仅设置页
      mounts: ['settings'],
      settings: [{ key: 'showTitles', type: 'boolean', label: '网格卡片显示标题', default: true }]
    },
    {}
  )
  official(
    {
      id: 'keyboardMouse',
      title: '键鼠交互',
      mounts: ['settings'],
      settings: [
        { key: 'enableSearchShortcut', type: 'boolean', label: 'Ctrl+F 搜索', default: true }
      ]
    },
    { setup: setupKeyboardMouse }
  )
}
