/**
 * 功能组件（Feature Component）声明 —— 三端共享类型。
 * 一个功能组件 = 自包含单元（状态 + 逻辑 + 配置 + 渲染），对外只暴露声明；
 * 宿主（活动栏/显示面板/设置页）按声明渲染，不 import 具体组件。
 * 官方组件代码注册；未来插件经贡献点注册走同一条路（RFC PLUGIN-ARCH）。
 */

/** 挂载点：同一组件可挂多处，配置单一来源 */
export type MountPoint =
  | 'activityBar:left'   // 左活动栏工具（一个工具 = 一个面板）
  | 'activityBar:right'  // 右活动栏工具
  | 'displayPanel'       // 显示面板内的区块
  | 'settings'           // 设置页分区（按功能组件分类渲染）
  | 'statusBar'          // v2 预留
  | 'grid'               // v2 预留（网格内贡献）

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

/** 功能组件声明（manifest）：宿主渲染的依据 */
export interface FeatureManifest {
  /** 全局唯一 id，如 'layout' | 'sort' | 'mediaTypeFilter' | 'showTitles' */
  id: string
  title: string
  /** 挂载点列表：'displayPanel' 与 'settings' 并存 = 面板与设置页共享同一份配置 */
  mounts: MountPoint[]
  /** 用户可配置项（设置页据此渲染；面板读写同一份值，两处天然一致） */
  settings?: SettingSchema[]
  /** 选项的数据驱动源（预留：类别列表从 fileFormatMap、字段从 metadata-schema 生成） */
  dataSource?: 'fileFormatMap' | 'metadataSchema' | 'sortKeys' | null
}
