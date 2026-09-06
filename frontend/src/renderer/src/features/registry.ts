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

/**
 * 功能组件定义：manifest（声明）+ component（面板 UI 实现）+ setup（行为注册钩子）。
 * icon 仅渲染层关心（活动栏工具），不进 manifest（manifest 是可序列化声明）。
 */
export interface FeatureDefinition extends FeatureManifest {
  /** 面板 UI（挂 displayPanel / activityBar / settings 时渲染） */
  component?: Component
  /** 活动栏工具图标（渲染层关注点） */
  icon?: Component
  /** 行为注册钩子：返回清理函数则由宿主在卸载时执行（事件订阅必须可退订） */
  setup?: () => void | (() => void)
}

/**
 * 功能组件注册表 —— 贡献点的贡献侧。
 * 宿主（活动栏/显示面板/设置页）按挂载点查询渲染，不 import 具体组件；
 * 官方与三方经同一张表（机制同构，信任/生命周期分层——ARCHITECTURE §4.1）。
 */
const registry = new Map<string, FeatureDefinition>()

export function registerFeature(def: FeatureDefinition): void {
  if (registry.has(def.id)) {
    throw new Error(`功能组件 id 重复：${def.id}`)
  }
  registry.set(def.id, def)
}

export function getFeature(id: string): FeatureDefinition | undefined {
  return registry.get(id)
}

export function listFeatures(mount: MountPoint): FeatureDefinition[] {
  return [...registry.values()].filter((f) => f.mounts.includes(mount))
}

/** 应用启动时注册全部官方功能组件（静态可信：source=official，代码注册）。 */
export function registerBuiltinFeatures(): void {
  const official = (
    def: Omit<FeatureDefinition, 'source'> & { source?: FeatureSource }
  ): FeatureDefinition => ({ ...def, source: def.source ?? 'official' })

  // ── 左活动栏工具（壳的默认顺序，用户可拖拽重排——App.vue 持久化） ──
  registerFeature(official({ id: 'paths', title: '路径', mounts: ['activityBar:left'], icon: FolderOpen, component: PathsPanel }))
  registerFeature(official({ id: 'tags', title: '标签', mounts: ['activityBar:left'], icon: Tags, component: TagsPanel }))
  registerFeature(official({ id: 'display', title: '显示', mounts: ['activityBar:left'], icon: SlidersHorizontal, component: DisplayPanel }))

  // ── 右活动栏工具 ──
  registerFeature(official({ id: 'info', title: '媒体信息', mounts: ['activityBar:right'], icon: Info, component: InfoPanel }))
  registerFeature(official({ id: 'plugins', title: '插件', mounts: ['activityBar:right'], icon: Puzzle, component: PluginsPanel }))

  // ── 显示面板区块 ──
  registerFeature(
    official({
      id: 'mediaTypeFilter',
      title: '媒体类型',
      mounts: ['displayPanel'],
      dataSource: 'fileFormatMap',
      component: MediaTypeFeature
    })
  )
  registerFeature(
    official({
      id: 'sort',
      title: '排序',
      mounts: ['displayPanel'],
      dataSource: 'sortKeys',
      component: SortFeature
    })
  )
  registerFeature(
    official({
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
      ],
      component: LayoutFeature
    })
  )
  // 贡献点 v0 垂直切片：消费 HostApi（listRoots/declaredTags）的官方组件
  registerFeature(
    official({
      id: 'workspaceInfo',
      title: '工作区信息',
      mounts: ['displayPanel'],
      component: WorkspaceInfoFeature
    })
  )

  // ── 仅设置页 ──
  registerFeature(
    official({
      id: 'showTitles',
      title: '卡片标题',
      // 按用户决策（2026-08-23）：不出现在活动栏功能组件实例，仅设置页
      mounts: ['settings'],
      settings: [{ key: 'showTitles', type: 'boolean', label: '网格卡片显示标题', default: true }]
    })
  )
  registerFeature(
    official({
      id: 'keyboardMouse',
      title: '键鼠交互',
      mounts: ['settings'],
      settings: [
        { key: 'enableSearchShortcut', type: 'boolean', label: 'Ctrl+F 搜索', default: true }
      ],
      setup: setupKeyboardMouse
    })
  )
}

/** 各组件行为钩子的清理函数（setupFeatureBehaviors 收集）。 */
const disposers: Array<() => void> = []

/** 注册后统一执行各组件的行为钩子；返回的清理函数可全部退订（幂等：setup 内部自保只装一次）。 */
export function setupFeatureBehaviors(): void {
  for (const f of registry.values()) {
    const d = f.setup?.()
    if (typeof d === 'function') disposers.push(d)
  }
}

export function disposeFeatureBehaviors(): void {
  for (const d of disposers.splice(0)) d()
}
