/**
 * 命令面板 —— 调用面第三个视图（右键菜单 / 快捷键 / 命令面板，ARCHITECTURE §3.2）。
 *
 * 两条纪律决定本文件的形状：
 * 1. **面板是命令注册表的视图**（D23 的推论）：行 = 注册表条目，不另立清单、不做本地命令表；
 *    因此"能搜到什么"恒等于"注册了什么"，快捷键也从同一张绑定表现取（displayShortcut）。
 * 2. **不静默失败**：命令的 when 谓词在调用瞬间求值，求值不过的行**如实标为不可用**
 *    （灰显 + 不可执行），而不是让它执行成一个空操作（本项目"点了没反应"类缺陷的根因）。
 *
 * 可用性判定用**候选上下文**：面板由键盘唤起（无 DOM 目标），而命令的目标种类各异
 * （shell / item / node）。故壳现场构造当前**可能成立**的上下文集合（shell 恒有；
 * 多选集非空时补 item），一个命令在其中任一上下文下可执行即视为可用，执行时用那个上下文。
 * 这是"多贡献者按上下文现场聚合"（ARCHITECTURE §3.2 调用面）在面板上的直接译法。
 *
 * 纯逻辑（候选上下文 / 过滤 / 排序 / 可用性）与开合状态分开：前者无 Vue、无 store，可直接断言。
 */

import { ref } from 'vue'
import { evalWhen, listCommands, type CommandEntry } from './commands'
import { describe as describeShortcut, listShortcuts } from './keyboardMouse/shortcuts'
import type { MenuContext } from '@shared/types/command'

// ── 开合状态（壳级，全局唯一实例）：命令写入，CommandPalette.vue 读取渲染 ──

const opened = ref(false)

export function openPalette(): void {
  opened.value = true
}

export function closePalette(): void {
  opened.value = false
}

export function usePaletteState(): typeof opened {
  return opened
}

// ── 候选上下文 ──

export interface PaletteBase {
  workspaceId: string | null
  /** 当前多选集（item store 投影）。 */
  selectionIds: string[]
  /** 单选中的条目（信息面板/最后点击的那个）；无则 null。 */
  targetItemId: string | null
  /** 详情页翻页此刻是否可用（壳的现场事实，见 detailNav）——命令的 when 会读它。 */
  detailNavActive?: boolean
}

/**
 * 当前可能成立的调用上下文：shell 恒在（视图类命令的归属），
 * 有目标条目**且在工作区视图里**时补一条 item 上下文（批量与单条命令的归属）。
 * 为什么 item 上下文要求工作区非空：条目类命令的操作对象与标签池都按工作区取
 * （批量打标要工作区的声明投影）——没有活动工作区时它们本就无解，
 * 不该在面板上谎报可用（那样的"能按但什么都不发生"正是本文件要消灭的）。
 * 现场事实（detailNav）进 shell 上下文——与快捷键执行器构造的那份同形。
 */
export function paletteCandidates(base: PaletteBase): MenuContext[] {
  const selection = { ids: [...base.selectionIds] }
  const contexts: MenuContext[] = [
    {
      target: { kind: 'shell' },
      workspaceId: base.workspaceId,
      selection,
      detailNav: base.detailNavActive === true
    }
  ]
  const targetId = base.targetItemId ?? base.selectionIds[0] ?? null
  if (targetId != null && base.workspaceId != null) {
    contexts.push({
      target: { kind: 'item', id: targetId },
      workspaceId: base.workspaceId,
      selection
    })
  }
  return contexts
}

// ── 行组装（纯函数） ──

export interface PaletteRow {
  entry: CommandEntry
  /** 执行时使用、且让该行可用的那个上下文。 */
  ctx: MenuContext
  /** 当前是否可执行（when 在候选上下文里有一个成立）；false 行灰显且跳过。 */
  applicable: boolean
  /** 已绑定的组合键描述（'Ctrl+F' 之类）；未绑定为 null。 */
  shortcut: string | null
}

/** 关键字匹配：命令标题 / 命令 id 的子串（大小写不敏感）；空串 = 全通过。 */
export function matchCommand(query: string, entry: CommandEntry): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  const { id, title } = entry.manifest
  return title.toLowerCase().includes(q) || id.toLowerCase().includes(q)
}

/** 菜单分组次序：面板沿用菜单装配的组序（导航 → 修改 → 危险），无菜单的命令沉底。 */
const GROUP_ORDER: Record<string, number> = { nav: 0, modify: 1, danger: 2 }

function groupRank(entry: CommandEntry): number {
  const group = entry.manifest.menu?.group
  return group == null ? 3 : (GROUP_ORDER[group] ?? 3)
}

/**
 * 装配面板行：when 求值（候选上下文）→ 关键字过滤 → 可用在前、组序/标题排序。
 * 不可用的行**保留但沉底**：面板是注册表的视图，隐藏它们就等于"注册了却看不见"；
 * 标出来才能解释"为什么现在按不了"。
 */
export function assemblePalette(
  entries: readonly CommandEntry[],
  candidates: readonly MenuContext[],
  query: string,
  shortcuts: readonly { commandId: string; key: string; mod?: boolean; shift?: boolean; alt?: boolean }[] = listShortcuts()
): PaletteRow[] {
  const rows: PaletteRow[] = []
  for (const entry of entries) {
    if (!matchCommand(query, entry)) continue
    const ctx = candidates.find((c) => evalWhen(entry.manifest.when, c)) ?? null
    const binding = shortcuts.find((b) => b.commandId === entry.manifest.id)
    rows.push({
      entry,
      ctx: ctx ?? candidates[0] ?? { target: { kind: 'shell' }, workspaceId: null },
      applicable: ctx != null,
      shortcut: binding == null ? null : describeShortcut(binding)
    })
  }
  const title = (r: PaletteRow): string => r.entry.manifest.title
  return rows.sort((a, b) => {
    if (a.applicable !== b.applicable) return a.applicable ? -1 : 1
    return (
      groupRank(a.entry) - groupRank(b.entry) ||
      title(a).localeCompare(title(b), 'zh-Hans-CN') ||
      a.entry.manifest.id.localeCompare(b.entry.manifest.id)
    )
  })
}

/**
 * 面板一次完整装配：取注册表（只出官方——三方装载未接线，与右键菜单同一口径）→ 组装行。
 * 壳体（CommandPalette.vue）只负责取上下文与渲染。
 */
export function buildPalette(query: string, base: PaletteBase): PaletteRow[] {
  const entries = listCommands().filter((e) => e.manifest.source === 'official')
  return assemblePalette(entries, paletteCandidates(base), query)
}
