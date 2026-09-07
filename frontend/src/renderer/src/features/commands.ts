import type {
  CommandHandler,
  CommandManifest,
  MenuContext,
  MenuGroup,
  WhenClause
} from '@shared/types/command'

/**
 * 命令注册表 —— 调用面的原子（ARCHITECTURE §3.2）。
 * 右键菜单 / 命令面板 / 快捷键都是这张表的视图；装配规则（when 过滤、分组排序、
 * 危险区沉底）全部在壳，贡献者只有声明（manifest）+ 执行（run）。
 * 官方代码注册；三方路径下声明经 manifest 装载、重复 id 拒绝+报告（不炸注册流程）。
 */
export interface CommandEntry {
  manifest: CommandManifest
  run: CommandHandler
}

const registry = new Map<string, CommandEntry>()

/** 注册命令。重复 id 抛错——官方静态注册期望开发期暴露；contributed 届时在装载处降级为拒绝。 */
export function registerCommand(manifest: CommandManifest, run: CommandHandler): void {
  if (registry.has(manifest.id)) {
    throw new Error(`命令 id 重复：${manifest.id}`)
  }
  registry.set(manifest.id, { manifest, run })
}

/** 移除单个命令（三方卸载的机制承载；官方 v0 不调用）。 */
export function unregisterCommand(id: string): void {
  registry.delete(id)
}

export function getCommand(id: string): CommandEntry | undefined {
  return registry.get(id)
}

/** when 谓词求值：壳用，不加载任何实现。 */
export function evalWhen(when: WhenClause | undefined, ctx: MenuContext): boolean {
  if (when == null) return true
  switch (when.kind) {
    case 'targetIs':
      return ctx.target.kind === when.value
    case 'fieldEquals': {
      const actual = resolveField(ctx, when.field)
      return actual === when.value
    }
    case 'all':
      return when.clauses.every((c) => evalWhen(c, ctx))
  }
}

/** 浅层路径解析：'target.kind' / 'workspaceId'。 */
function resolveField(ctx: MenuContext, field: string): unknown {
  return field.split('.').reduce<unknown>((obj, key) => {
    return obj != null && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined
  }, ctx)
}

const GROUP_ORDER: MenuGroup[] = ['nav', 'modify', 'danger']

/** 壳装配结果：一个非空分组 = 一节，节间画分隔线。 */
export interface MenuSection {
  group: MenuGroup
  commands: CommandEntry[]
}

/**
 * 调用瞬间装配：when 过滤 → 分组 → 组内按 order（建议字段）稳定排序 → 空组剔除。
 * danger 组天然最后（GROUP_ORDER 决定），命令无需自觉。
 */
export function assembleMenu(ctx: MenuContext): MenuSection[] {
  const byGroup = new Map<MenuGroup, CommandEntry[]>()
  for (const entry of registry.values()) {
    if (entry.manifest.source !== 'official') continue // 三方装载未接线，先只出官方
    if (!evalWhen(entry.manifest.when, ctx)) continue
    const group = entry.manifest.menu?.group ?? 'modify'
    if (!byGroup.has(group)) byGroup.set(group, [])
    byGroup.get(group)!.push(entry)
  }
  return GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({
    group,
    commands: byGroup.get(group)!.sort(
      (a, b) => (a.manifest.menu?.order ?? 0) - (b.manifest.menu?.order ?? 0) || a.manifest.id.localeCompare(b.manifest.id)
    )
  }))
}
