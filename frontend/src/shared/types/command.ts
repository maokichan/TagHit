/**
 * 命令（Command）—— 调用面（右键菜单/命令面板/快捷键）的原子，ARCHITECTURE §3.2。
 * 声明面（本文件，可序列化）与执行（handler 在 features/commands.ts）分离，
 * 与 FeatureManifest / FeatureImpl 的分层同构：三方路径下声明即磁盘 JSON 的形状，
 * 壳不加载实现即可按 when 过滤。
 */

/** 菜单分组语义由壳定义：nav 导航 / modify 修改 / danger 危险（壳强制沉底 + 警示）。 */
export type MenuGroup = 'nav' | 'modify' | 'danger'

/**
 * 调用上下文的目标种类：
 * - `item`：条目卡片/网格行（`id` = 条目 id）；
 * - `node`：来源根树的一行（`dirPath` = 目录路径，节点身份 = 工作区 × 目录路径）；
 * - `shell`：无 DOM 目标（键盘触发、命令面板），命令自行判断可用性；
 * - 其余为组件自定义种类（when 里按字符串相等匹配）。
 */
export type TargetKind = 'item' | 'node' | 'shell' | (string & {})

/**
 * 命令上下文：壳在拦截点构造（context target 就近声明 + 视图状态投影）。
 * selection：target 落入多选集时为多选集、否则为单个 target——批量命令经此取操作对象。
 * workspaceId：拦截点优先取**目标自己声明的工作区**（`data-ctx-workspace`），
 * 其次才是活动标签的——功能标签页的工作区上下文在打开瞬间固化到标签项，活动工作区可能为空（D25）。
 */
export interface MenuContext {
  target: { kind: TargetKind; id?: string; dirPath?: string }
  workspaceId: string | null
  /** 本次操作的对象集（id 列表）。target.kind='item' 时非空。 */
  selection?: { ids: string[] }
  /**
   * 壳现场填充的**可用性事实**：只由壳写入，命令用 when 的 `fieldEquals` 读取。
   * 例：`detailNav` = 详情页翻页是否可用（当前挂着详情页）——"生效范围"由此可求值，
   * 命令面板因此能如实标"当前不可用"，而不是让命令执行成一个静默空操作。
   */
  detailNav?: boolean
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
