import type { Component } from 'vue'
import type { FeatureManifest, MountPoint } from '@shared/types/feature'
import MediaTypeFeature from './display/mediaType/MediaTypeFeature.vue'
import SortFeature from './display/sort/SortFeature.vue'
import LayoutFeature from './display/layout/LayoutFeature.vue'
import { setupKeyboardMouse } from './keyboardMouse/setup'

/** 功能组件定义：manifest（声明）+ component（面板 UI 实现）+ setup（行为注册钩子） */
export interface FeatureDefinition extends FeatureManifest {
  /** 面板 UI（挂 displayPanel / activityBar 时渲染；仅 settings 挂载的组件可无） */
  component?: Component
  /** 行为注册钩子（无 UI 组件的功能组件：快捷键监听等），应用启动时执行一次（组件内部保证幂等） */
  setup?: () => void
}

/**
 * 功能组件注册表 —— 宿主（活动栏/显示面板/设置页）按挂载点查询渲染，
 * 不 import 具体组件。官方组件代码注册；未来插件经贡献点注册走同一条路。
 */
const registry = new Map<string, FeatureDefinition>()

export function registerFeature(def: FeatureDefinition): void {
  registry.set(def.id, def)
}

export function getFeature(id: string): FeatureDefinition | undefined {
  return registry.get(id)
}

export function listFeatures(mount: MountPoint): FeatureDefinition[] {
  return [...registry.values()].filter((f) => f.mounts.includes(mount))
}

/** 应用启动时注册全部官方功能组件（见 features/display/index.ts） */
export function registerBuiltinFeatures(): void {
  // 显示相关组件
  registerFeature({
    id: 'mediaTypeFilter',
    title: '媒体类型',
    mounts: ['displayPanel'],
    dataSource: 'fileFormatMap',
    component: MediaTypeFeature
  })
  registerFeature({
    id: 'sort',
    title: '排序',
    mounts: ['displayPanel'],
    dataSource: 'sortKeys',
    component: SortFeature
  })
  registerFeature({
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
  registerFeature({
    id: 'showTitles',
    title: '卡片标题',
    // 按用户决策（2026-08-23）：不出现在活动栏功能组件实例，仅设置页
    mounts: ['settings'],
    settings: [{ key: 'showTitles', type: 'boolean', label: '网格卡片显示标题', default: true }]
  })
  // 键鼠交互（占位）：仅设置页；先落地 Ctrl+F 搜索快捷键，其余远期
  registerFeature({
    id: 'keyboardMouse',
    title: '键鼠交互',
    mounts: ['settings'],
    settings: [
      { key: 'enableSearchShortcut', type: 'boolean', label: 'Ctrl+F 搜索', default: true }
    ],
    setup: setupKeyboardMouse
  })
}

/** 注册后统一执行各组件的行为钩子（幂等：setup 内部自行保证只装一次） */
export function setupFeatureBehaviors(): void {
  for (const f of registry.values()) f.setup?.()
}
