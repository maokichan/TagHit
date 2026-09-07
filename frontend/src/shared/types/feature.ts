/**
 * 功能组件（Feature Component）声明 —— 渲染层共享类型（可序列化声明面）。
 * 一个功能组件 = 自包含单元（状态 + 逻辑 + 配置 + 渲染），对外只暴露声明；
 * 壳（活动栏/显示面板/设置页）按声明渲染，不 import 具体组件。
 * 声明与实现绑定分离：本文件只有可序列化 manifest；实现绑定（直连/loader）
 * 在 features/registry.ts（渲染层关注点）。三方插件经同一注册表动态注册
 * （信任/生命周期分层，机制同构——选型理由与验收标准见 docs/ARCHITECTURE §3.1）。
 */

/**
 * 挂载点（贡献点 v0 清单 = 壳的权力清单，ARCHITECTURE §3.1）：
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

/** 信任层：official = 构建期直连；contributed = 运行期 loader（权限门/独立生命周期，未落地）。 */
export type FeatureSource = 'official' | 'contributed'

export interface SettingOption {
  value: string
  label: string
}

/**
 * 用户可配置项：key 是**组件内** key（存储归属裁决前由 ui store 人肉路由，
 * 三方接入前需落 `featureId:key` 命名空间化——DECISIONS 待裁决项）。
 */
export interface SettingSchema {
  key: string
  type: 'boolean' | 'enum' | 'string' | 'number'
  label: string
  options?: SettingOption[]
  default?: unknown
}

/** 生命周期：setup 返回的清理函数在卸载时执行（事件订阅必须可退订）。 */
export type Disposer = () => void

/**
 * 功能组件声明（manifest）：壳渲染的依据；三方路径下即磁盘 JSON 的形状。
 * 可序列化是惰性加载的前提——壳先读声明，激活条件满足才经 loader 取实现。
 */
export interface FeatureManifest {
  /** 全局唯一 id，如 'layout' | 'sort' | 'paths' | 'workspaceInfo' */
  id: string
  title: string
  source: FeatureSource
  /** 挂载点列表：'displayPanel' 与 'settings' 并存 = 面板与设置页共享同一份配置 */
  mounts: MountPoint[]
  /** 用户可配置项（设置页据此渲染；面板读写同一份值，两处天然一致） */
  settings?: SettingSchema[]
  /** 选项的数据驱动源（预留：类别列表从 fileFormatMap、字段从 metadata-schema 生成；v0 未消费，语义落地前三方勿用） */
  dataSource?: 'fileFormatMap' | 'metadataSchema' | 'sortKeys' | null
}
