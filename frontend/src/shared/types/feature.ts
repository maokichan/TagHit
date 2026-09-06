/**
 * 功能组件（Feature Component）声明 —— 渲染层共享类型。
 * 一个功能组件 = 自包含单元（状态 + 逻辑 + 配置 + 渲染），对外只暴露声明；
 * 宿主（活动栏/显示面板/设置页）按声明渲染，不 import 具体组件。
 * 官方组件代码注册；三方插件经同一注册表动态注册（信任/生命周期分层，机制同构——
 * 选型理由与验收标准见 docs/ARCHITECTURE §4.1）。
 */

/**
 * 挂载点（贡献点 v0 清单 = 壳的权力清单，ARCHITECTURE §4）：
 * 同一组件可挂多处，配置单一来源。
 * statusBar / grid 为 v2 预留：不进 v0 注册清单，仅留类型占位。
 */
export type MountPoint =
  | 'activityBar:left'   // 左活动栏工具（一个工具 = 一个面板）
  | 'activityBar:right'  // 右活动栏工具
  | 'displayPanel'       // 显示面板内的区块
  | 'settings'           // 设置页分区（按功能组件分类渲染）
  | 'statusBar'          // v2 预留
  | 'grid'               // v2 预留（网格内贡献）

/** 信任层：官方 = 静态可信；contributed = 动态加载（权限门/错误隔离/独立生命周期，未落地）。 */
export type FeatureSource = 'official' | 'contributed'

export interface SettingOption {
  value: string
  label: string
}

/** 用户可配置项：key 对应 config 字段（或功能组件自己的配置切片），设置页据此渲染表单 */
export interface SettingSchema {
  key: string
  type: 'boolean' | 'enum' | 'string' | 'number'
  label: string
  options?: SettingOption[]
  default?: unknown
}

/** 生命周期：setup 返回的清理函数在宿主卸载时执行（事件订阅必须可退订）。 */
export type Disposer = () => void

/** 功能组件声明（manifest）：宿主渲染的依据。声明式 manifest 是惰性加载的前提。 */
export interface FeatureManifest {
  /** 全局唯一 id，如 'layout' | 'sort' | 'paths' | 'workspaceInfo' */
  id: string
  title: string
  source: FeatureSource
  /** 挂载点列表：'displayPanel' 与 'settings' 并存 = 面板与设置页共享同一份配置 */
  mounts: MountPoint[]
  /** 用户可配置项（设置页据此渲染；面板读写同一份值，两处天然一致） */
  settings?: SettingSchema[]
  /** 选项的数据驱动源（预留：类别列表从 fileFormatMap、字段从 metadata-schema 生成） */
  dataSource?: 'fileFormatMap' | 'metadataSchema' | 'sortKeys' | null
}
