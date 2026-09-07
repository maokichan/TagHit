import { useTabStore } from '../stores/tab'
import { useItemStore } from '../stores/item'
import { registerCommand, type CommandEntry } from './commands'
import type { CommandManifest } from '@shared/types/command'

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
}
