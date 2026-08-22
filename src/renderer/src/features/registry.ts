import type { Component } from 'vue'
import type { FeatureManifest, MountPoint } from '@shared/types/feature'
import MediaTypeFeature from './display/mediaType/MediaTypeFeature.vue'
import SortFeature from './display/sort/SortFeature.vue'
import LayoutFeature from './display/layout/LayoutFeature.vue'

/** 功能组件定义：manifest（声明）+ component（面板 UI 实现） */
export interface FeatureDefinition extends FeatureManifest {
  /** 面板 UI（挂 displayPanel / activityBar 时渲染；仅 settings 挂载的组件可无） */
  component?: Component
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
}
