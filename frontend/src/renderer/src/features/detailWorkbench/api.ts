/**
 * 工作台内部 API（D41）：树节点组件（WBNodeView）经 inject 取用的装配面。
 * 与 context.ts（视图侧的事实与动作）分流——这是容器侧：布局变更、拖放、菜单、权重。
 */
import { inject, provide, type InjectionKey, type Ref } from 'vue'
import { i18n } from '../../i18n'
import type { SplitDir, WorkbenchLayout } from './slots'

/** 回添菜单锚点（叶 id + 触发按钮的屏幕坐标；fixed 定位，翻转防溢出）。 */
export interface MenuAnchor {
  leafId: string
  x: number
  y: number
}

export interface WorkbenchApi {
  layout: Ref<WorkbenchLayout | null>
  /** 当前被拖拽的视图 id（null = 无拖拽；缘落点区仅此时出现）。 */
  draggingId: Ref<string | null>
  menu: Ref<MenuAnchor | null>
  openMenu(leafId: string, e: MouseEvent): void
  closeMenu(): void
  startDrag(viewId: string, e: DragEvent): void
  endDrag(): void
  isWorkbenchDrag(e: DragEvent): boolean
  activate(leafId: string, viewId: string): void
  addToLeaf(viewId: string, leafId: string): void
  closeView(viewId: string): void
  splitLeaf(leafId: string, dir: SplitDir, viewId?: string): void
  closeLeaf(leafId: string): void
  commitWeights(splitId: string, weights: number[]): void
}

const KEY: InjectionKey<WorkbenchApi> = Symbol('workbenchApi')

export const DRAG_MIME = 'application/x-taghit-detail-view'

export function provideWorkbenchApi(api: WorkbenchApi): void {
  provide(KEY, api)
}

export function useWorkbenchApi(): WorkbenchApi {
  const api = inject(KEY)
  if (api == null) throw new Error(i18n.global.t('wb.assertInside'))
  return api
}
