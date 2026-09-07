import { useTabStore } from '../stores/tab'
import { useItemStore } from '../stores/item'
import { registerCommand, type CommandEntry } from './commands'
import { openBatchTagDialog } from './services/batchTag'
import { api } from '@shared/api'
import type { CommandManifest, MenuContext } from '@shared/types/command'

/**
 * 官方命令 —— 命令注册表机制的持续测试桩（同构：三方将来走同一张表）。
 * 声明 + 执行分离与 FeatureDefinition 一致；run 只经窄桥用例或渲染层自有动作
 * （剪贴板），不做本地数据突变。
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
      useTabStore().openItem(view.id, ctx.workspaceId, view.title)
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
}

/** 批量命令的操作对象集：selection ∩ 当前工作区视图条目（过滤离屏/删除 id，防 NOT_FOUND）。 */
function batchItemIds(ctx: MenuContext): string[] {
  const inView = new Set(useItemStore().items.map((i) => i.id))
  return (ctx.selection?.ids ?? []).filter((id) => inView.has(id))
}
