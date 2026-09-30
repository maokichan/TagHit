import router from '../router'
import { useTabStore } from '../stores/tab'
import { useItemStore } from '../stores/item'
import { registerCommand, type CommandEntry } from './commands'
import { registerShortcut } from './keyboardMouse/shortcuts'
import { openBatchTagDialog } from './services/batchTag'
import { detailNext, detailPrev } from './detailNav'
import { itemRoute } from './tabs'
import { api } from '@shared/api'
import type { ItemContext } from '@shared/contract'
import type { CommandManifest, MenuContext } from '@shared/types/command'

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

  // 清空选择（Esc）：视图动作，无菜单项
  official(
    { id: 'selection.clear', title: '清空选择', when: { kind: 'targetIs', value: 'shell' } },
    () => {
      useItemStore().clearSelection()
    }
  )

  // 条目详情页翻页（相册式浏览）：命令在注册表里，快捷键与页面上的两侧按钮**同源**——
  // 实现在详情页（挂载期登记到 detailNav 桥），没挂详情页时空操作。
  official(
    { id: 'item.prev', title: '上一张', when: { kind: 'targetIs', value: 'shell' } },
    () => detailPrev()
  )
  official(
    { id: 'item.next', title: '下一张', when: { kind: 'targetIs', value: 'shell' } },
    () => detailNext()
  )

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
  // 详情页翻页：← / → 与 PgUp / PgDn 四路并存——笔记本可能没有 PgUp/PgDn（要 Fn+↑），
  // 而视频聚焦时方向键属原生控件（见 keyboardMouse/setup.ts 的让位规则），那时 PgUp/PgDn 是主力。
  registerShortcut({ commandId: 'item.prev', key: 'arrowleft', label: '上一张' })
  registerShortcut({ commandId: 'item.next', key: 'arrowright', label: '下一张' })
  registerShortcut({ commandId: 'item.prev', key: 'pageup', label: '上一张' })
  registerShortcut({ commandId: 'item.next', key: 'pagedown', label: '下一张' })
}

/** 批量命令的操作对象集：selection ∩ 当前工作区视图条目（过滤离屏/删除 id，防 NOT_FOUND）。 */
function batchItemIds(ctx: MenuContext): string[] {
  const inView = new Set(useItemStore().items.map((i) => i.id))
  return (ctx.selection?.ids ?? []).filter((id) => inView.has(id))
}
