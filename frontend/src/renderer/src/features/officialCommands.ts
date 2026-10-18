import router from '../router'
import { useTabStore } from '../stores/tab'
import { useItemStore } from '../stores/item'
import { registerCommand, type CommandEntry } from './commands'
import { registerShortcut } from './keyboardMouse/shortcuts'
import { openBatchTagDialog } from './services/batchTag'
import { showToast } from './services/dialog'
import { detailNext, detailPrev, detailQuickTag } from './detailNav'
import { itemRoute } from './tabs'
import { openPalette } from './palette'
import { invalidatePathManagement } from './paths/usePathManagement'
import { api } from '@shared/api'
import type { ItemContext, NodeState } from '@shared/contract'
import type { CommandManifest, MenuContext, WhenClause } from '@shared/types/command'

/**
 * 官方命令 —— 命令注册表机制的持续测试桩（同构：三方将来走同一张表）。
 * 声明 + 执行分离与 FeatureDefinition 一致；run 只经窄桥用例或渲染层自有动作
 * （剪贴板/焦点），不做本地数据突变。
 * 底部同时声明**官方快捷键绑定**：绑定只指向命令 id（快捷键 = 命令注册表的视图）。
 */

function official(manifest: Omit<CommandManifest, 'source'>, run: CommandEntry['run']): void {
  registerCommand({ ...manifest, source: 'official' }, run)
}

/** 应用启动时注册全部官方命令（main.ts 调用；run 在点击时才执行，届时 pinia 已就绪）。 */
export function registerBuiltinCommands(): void {
  // 打开条目（双击的同语义入口）：经窄桥视图状态 → 条目标签页
  official(
    {
      id: 'item.open',
      title: '打开',
      menu: { group: 'nav', order: 0 },
      when: { kind: 'targetIs', value: 'item' }
    },
    (ctx) => {
      const view = useItemStore().items.find((i) => i.id === ctx.target.id)
      if (view == null) return
      const context: ItemContext = { workspaceId: ctx.workspaceId, ...useItemStore().orderContext() }
      useTabStore().openItem(view.id, ctx.workspaceId, view.title, context)
      void router.push(itemRoute(view.id, context))
    }
  )

  // 复制文件路径：渲染层自有动作（剪贴板），不经窄桥
  official(
    {
      id: 'item.copyPath',
      title: '复制文件路径',
      menu: { group: 'modify', order: 0 },
      when: { kind: 'targetIs', value: 'item' }
    },
    async (ctx) => {
      const view = useItemStore().items.find((i) => i.id === ctx.target.id)
      if (view?.sourceUri != null) await navigator.clipboard.writeText(view.sourceUri)
    }
  )

  // 批量打标（调用面样板：selection 多选集 → 受控服务弹层 → 批量用例 → 失效重查）
  official(
    {
      id: 'items.tagBatch',
      title: '批量打标签…',
      menu: { group: 'modify', order: 1 },
      when: { kind: 'targetIs', value: 'item' }
    },
    (ctx) => {
      const ids = batchItemIds(ctx)
      if (ctx.workspaceId == null || ids.length === 0) return
      openBatchTagDialog({
        mode: 'add',
        workspaceId: ctx.workspaceId,
        count: ids.length,
        onApply: async (_mode, tagIds) => {
          await api.items.tagMany(ids, tagIds)
          await useItemStore().load(ctx.workspaceId!)
        }
      })
    }
  )

  // 批量移除标签
  official(
    {
      id: 'items.untagBatch',
      title: '批量移除标签…',
      menu: { group: 'modify', order: 2 },
      when: { kind: 'targetIs', value: 'item' }
    },
    (ctx) => {
      const ids = batchItemIds(ctx)
      if (ctx.workspaceId == null || ids.length === 0) return
      openBatchTagDialog({
        mode: 'remove',
        workspaceId: ctx.workspaceId,
        count: ids.length,
        onApply: async (_mode, tagIds) => {
          await api.items.untagMany(ids, tagIds)
          await useItemStore().load(ctx.workspaceId!)
        }
      })
    }
  )

  // ── 节点（来源根树的目录行）可见性与浏览范围（D32）──
  // 与面板行内动作**同语义、同用例**，只多一个入口：右键菜单一次作用于整棵子树。
  // 面板里的"眼"是逐节点就地切换（Shift = 子树）与"只看"，窄面板空间有限；
  // 这里补的是"批量隐藏/显示整棵子树"的显式动作（隐藏类操作语义直白，不必记修饰键）。
  official(
    {
      id: 'node.onlyThis',
      title: '只看此节点（含子目录）',
      menu: { group: 'nav', order: 0 },
      when: { kind: 'targetIs', value: 'node' }
    },
    async (ctx) => {
      const target = nodeTarget(ctx)
      if (target == null) return
      // 浏览范围是视图状态（不写库）：与面板 Focus 键同一份状态、同一语义
      useItemStore().setScope(target.dirPath)
      invalidatePathManagement()
      // 失败不静默：load 异常经 await 传给执行通道（快捷键执行器/命令面板）的统一上报，
      // 不吞成 unhandled rejection——那在用户眼里就是"点了没反应"
      await useItemStore().load(target.workspaceId)
    }
  )
  official(
    {
      id: 'node.showSubtree',
      title: '显示此节点的全部子条目',
      menu: { group: 'modify', order: 0 },
      when: { kind: 'targetIs', value: 'node' }
    },
    (ctx) => setNodeSubtree(ctx, 'included')
  )
  official(
    {
      id: 'node.hideSubtree',
      title: '隐藏此节点及子目录的条目',
      menu: { group: 'modify', order: 1 },
      when: { kind: 'targetIs', value: 'node' }
    },
    (ctx) => setNodeSubtree(ctx, 'excluded')
  )

  // 聚焦搜索框（Ctrl+F）：视图动作，无菜单项——只经快捷键触发（when: shell）
  official(
    { id: 'shell.focusSearch', title: '聚焦搜索框', when: { kind: 'targetIs', value: 'shell' } },
    () => {
      const input = document.querySelector<HTMLInputElement>('[data-shortcut="search"]')
      if (input == null) return
      input.focus()
      input.select()
    }
  )

  // 命令面板（Ctrl+Shift+P）：调用面入口本身也是一个命令（快捷键 = 注册表的视图）
  official({ id: 'shell.commandPalette', title: '显示所有命令', when: { kind: 'targetIs', value: 'shell' } }, () => {
    openPalette()
  })

  // 全选（壳菜单 / Ctrl+A）：作用于当前视图已加载的成员；空白右键在网格内开壳菜单后即可见
  official(
    {
      id: 'items.selectAll',
      title: '全选',
      menu: { group: 'nav', order: 1 },
      when: { kind: 'targetIs', value: 'shell' }
    },
    () => useItemStore().selectAll()
  )

  // 清空选择（Esc 为主路径）：壳菜单第二项
  official(
    {
      id: 'selection.clear',
      title: '清空选择',
      menu: { group: 'nav', order: 2 },
      when: { kind: 'targetIs', value: 'shell' }
    },
    () => {
      useItemStore().clearSelection()
    }
  )

  // ── 壳导航命令（D33：面板是注册表的视图；面板管"去哪里"，不复制就地控件）──
  // 入口纪律：全页呈现的唯一入口是停靠面板右下角角标（D22/D26），布局/标题等视图控制的
  // 唯一入口是显示面板与设置页——命令面板不为它们开第二扇门（2026-10-18 修剪：
  // 曾一次性塞入 8 条，其中 6 条违反入口纪律或未经执行路径核查，已撤）。
  // 主页：关闭全部主页标签后没有别的回程（"+"与设置都会经 ensureHome 兜底）→ 面板是正路。
  official(
    { id: 'shell.home', title: '打开主页', when: { kind: 'targetIs', value: 'shell' } },
    () => {
      useTabStore().openNewHome()
      void router.push('/')
    }
  )
  // 设置：标签必须先在 tab store 里存在，守卫才认可 '/settings'（无匹配标签会被弹回活动标签）
  official(
    { id: 'shell.settings', title: '打开设置', when: { kind: 'targetIs', value: 'shell' } },
    () => {
      useTabStore().openSettings()
      void router.push('/settings')
    }
  )

  // 条目详情页翻页（相册式浏览）：命令在注册表里，快捷键与页面上的两侧按钮**同源**——
  // 实现在详情页（挂载期登记到 detailNav 桥）。when 里带上"详情页是否可用"（壳现场填充的事实，
  // 见 detailNav.isDetailNavMounted）：这样命令面板会如实标不可用，而不是执行成静默空操作。
  const detailPageOnly: WhenClause = {
    kind: 'all',
    clauses: [
      { kind: 'targetIs', value: 'shell' },
      { kind: 'fieldEquals', field: 'detailNav', value: true }
    ]
  }
  official({ id: 'item.prev', title: '上一张', when: detailPageOnly }, () => detailPrev())
  official({ id: 'item.next', title: '下一张', when: detailPageOnly }, () => detailNext())

  // 速打标签（数字键 1..9）：pin 映射归标签职能，在标签全页「数字键速打」配置
  // （config `tags:pinned:<wsId>`）；执行 = 桥上本页的 toggleTag。未配置的键号是空操作——
  // 配置区与键位表都可见，不属静默失败。输入态（标签搜索框等）由执行器的豁免规则放行。
  for (const digit of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
    official(
      { id: `item.quickTag.${digit}`, title: `速打标签 ${digit}`, when: detailPageOnly },
      () => {
        void detailQuickTag(digit)
      }
    )
    registerShortcut({
      commandId: `item.quickTag.${digit}`,
      key: String(digit),
      label: `速打标签 ${digit}`
    })
  }


  // ── 官方快捷键绑定（快捷键 = 命令注册表的视图；行为逐个增补） ──
  // Ctrl+F：沿用"键鼠交互"设置开关；输入态也允许（本来就在找搜索框）
  registerShortcut({
    commandId: 'shell.focusSearch',
    key: 'f',
    mod: true,
    allowInEditable: true,
    gate: { featureId: 'keyboardMouse', key: 'enableSearchShortcut', fallback: true },
    label: '聚焦搜索框'
  })
  // Esc：清空多选集（含输入态——打字时按 Esc 也应当退出选择态）
  registerShortcut({ commandId: 'selection.clear', key: 'escape', label: '清空选择' })
  // Ctrl+A 全选：输入态不触发（执行器豁免规则），文本框内的原生全选不受影响
  registerShortcut({ commandId: 'items.selectAll', key: 'a', mod: true, label: '全选' })
  // 详情页翻页：← / → 与 PgUp / PgDn 四路并存——笔记本可能没有 PgUp/PgDn（要 Fn+↑），
  // 而视频聚焦时方向键属原生控件（见 keyboardMouse/setup.ts 的让位规则），那时 PgUp/PgDn 是主力。
  registerShortcut({ commandId: 'item.prev', key: 'arrowleft', label: '上一张' })
  registerShortcut({ commandId: 'item.next', key: 'arrowright', label: '下一张' })
  registerShortcut({ commandId: 'item.prev', key: 'pageup', label: '上一张' })
  registerShortcut({ commandId: 'item.next', key: 'pagedown', label: '下一张' })
  // 命令面板：VS Code 同款组合键；输入态也允许（正打字时想换命令是常态）
  registerShortcut({
    commandId: 'shell.commandPalette',
    key: 'p',
    mod: true,
    shift: true,
    allowInEditable: true,
    label: '显示所有命令'
  })
}

/** 批量命令的操作对象集：selection ∩ 当前工作区视图条目（过滤离屏/删除 id，防 NOT_FOUND）。 */
function batchItemIds(ctx: MenuContext): string[] {
  const inView = new Set(useItemStore().items.map((i) => i.id))
  return (ctx.selection?.ids ?? []).filter((id) => inView.has(id))
}

/**
 * 节点命令的目标：目录路径由树行声明（MenuContext.target.dirPath），工作区由目标自带
 * （`data-ctx-workspace`——功能标签页里活动工作区为空，不能靠运行时推断，D25）。
 */
function nodeTarget(ctx: MenuContext): { workspaceId: string; dirPath: string } | null {
  const dirPath = ctx.target.dirPath
  if (ctx.workspaceId == null || dirPath == null || dirPath === '') return null
  return { workspaceId: ctx.workspaceId, dirPath }
}

/** 子树可见性（含自身 + 全部后代，单事务）：面板块里的 Shift+点击就是这个用例。 */
async function setNodeSubtree(ctx: MenuContext, state: NodeState): Promise<void> {
  const target = nodeTarget(ctx)
  if (target == null) return
  try {
    await api.nodes.setSubtreeState(target.workspaceId, target.dirPath, state)
  } catch (e) {
    // 失败不静默：节点行可能已被重扫清掉（NOT_FOUND）——用户要看得见，而不是"点了没反应"
    showToast(e instanceof Error ? e.message : String(e), 'error')
    return
  }
  invalidatePathManagement()
  await useItemStore().load(target.workspaceId)
  showToast(state === 'excluded' ? '已隐藏该节点及其子目录的条目' : '已显示该节点及其子目录的条目')
}
