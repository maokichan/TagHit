/**
 * 详情页工作台的上下文（D39）：详情页骨架提供的事实与动作，工作台经 provide 注入视图。
 * 视图只声明自己是"条目的一个侧面"，数据与动作全部来自上下文——视图可被安置到任意槽位，
 * 不感知自己在哪（机制同构 features/context.ts 的 FeatureContext）。
 */
import { inject, provide, reactive } from 'vue'
import type { InjectionKey } from 'vue'
import type { ItemView } from '../../lib/viewModel'

export interface DetailWorkbenchContext {
  /** 当前条目（骨架持有、单源；视图不自取）。 */
  item: ItemView
  /** 顺序上下文里的工作区（null = 跨工作区打开，不可打标）。 */
  workspaceId: string | null
  /** 编辑模式（D38：模式态挂在条目标签项上，翻页保持）。 */
  editing: boolean
  /** 顺序窗口切片（预览条与翻页同源）。 */
  windowViews: ItemView[]
  prev: ItemView | null
  next: ItemView | null
  /** 翻页（骨架实现：换标签项内容不新开标签；预览条点选与两侧按钮同走这里）。 */
  go(target: ItemView | null): void
  /** 打标/摘除（骨架实现：改库 + 刷新当前条目；失败有 toast，不静默）。 */
  toggleTag(tagId: string): Promise<void>
}

const KEY: InjectionKey<DetailWorkbenchContext> = Symbol('detailWorkbench')

/** 骨架侧：把 props 包成带 getter 的响应式上下文（prop 变化即视图更新）。 */
export function provideDetailWorkbenchContext(source: {
  item: () => ItemView
  workspaceId: () => string | null
  editing: () => boolean
  windowViews: () => ItemView[]
  prev: () => ItemView | null
  next: () => ItemView | null
  go: (target: ItemView | null) => void
  toggleTag: (tagId: string) => Promise<void>
}): void {
  const ctx = reactive({
    get item() {
      return source.item()
    },
    get workspaceId() {
      return source.workspaceId()
    },
    get editing() {
      return source.editing()
    },
    get windowViews() {
      return source.windowViews()
    },
    get prev() {
      return source.prev()
    },
    get next() {
      return source.next()
    },
    go: source.go,
    toggleTag: source.toggleTag
  })
  provide(KEY, ctx)
}

/** 视图侧：取上下文（脱离工作台使用 = 编程错误，直接抛）。 */
export function useDetailWorkbenchContext(): DetailWorkbenchContext {
  const ctx = inject(KEY)
  if (ctx == null) throw new Error('detailView 视图只能在详情页工作台内渲染')
  return ctx
}
