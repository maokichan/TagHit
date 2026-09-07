/**
 * 命令（Command）—— 调用面（右键菜单/命令面板/快捷键）的原子，ARCHITECTURE §3.2。
 * 声明面（本文件，可序列化）与执行（handler 在 features/commands.ts）分离，
 * 与 FeatureManifest / FeatureImpl 的分层同构：三方路径下声明即磁盘 JSON 的形状，
 * 壳不加载实现即可按 when 过滤。
 */

/** 菜单分组语义由壳定义：nav 导航 / modify 修改 / danger 危险（壳强制沉底 + 警示）。 */
export type MenuGroup = 'nav' | 'modify' | 'danger'

/**
 * 命令上下文：壳在拦截点构造（context target 就近声明 + 视图状态投影）。
 * selection：target 落入多选集时为多选集、否则为单个 target——批量命令经此取操作对象。
 */
export interface MenuContext {
  target: { kind: string; id?: string }
  workspaceId: string | null
  /** 本次操作的对象集（id 列表）。target.kind='item' 时非空。 */
  selection?: { ids: string[] }
}

/**
 * 最小 when 谓词：壳可求值（相等/合取），防表达式引擎蔓延。
 * field 支持 'target.kind' / 'workspaceId' 等浅层路径。
 */
export type WhenClause =
  | { kind: 'targetIs'; value: string }
  | { kind: 'fieldEquals'; field: string; value: string | number | boolean | null }
  | { kind: 'all'; clauses: WhenClause[] }

/** 命令声明：菜单摆放（group/order）只是建议字段；装配/溢出/危险区沉底是壳的硬规则。 */
export interface CommandManifest {
  /** 命名空间化 id：域.动作，如 'item.open' | 'item.copyPath' */
  id: string
  title: string
  menu?: { group: MenuGroup; order?: number }
  when?: WhenClause
  /** 信任层，与 FeatureSource 同构；v0 仅 official */
  source: 'official' | 'contributed'
}

/** 命令执行：只经 HostApi 门面（改意图 → 窄桥 → 失效重查），不做本地数据突变。 */
export type CommandHandler = (ctx: MenuContext) => void | Promise<void>
