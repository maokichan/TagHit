/**
 * 详情页工作台视图注册表（detailView 面，D39）——视图是"条目的一个侧面"。
 * 与 detailPreview（按条目认领，D37）正交：本表按**声明**常驻，不按条目认领
 * （按条目显隐 parked）。机制同构 detailPreview：模块级注册表、同 id 替换、
 * 注销即摘除——消费方是工作台的槽位 tab 栈，不是预览解析。
 */
import type { Component } from 'vue'
import { i18n } from '../../i18n'
import type { DetailSlotId, KnownView } from './slots'
import PreviewCenter from './views/PreviewCenter.vue'
import InfoSurface from './views/InfoSurface.vue'
import FilmstripView from './views/FilmstripView.vue'

export interface DetailViewEntry {
  /** 全局唯一 id（内置 `builtin:<name>`；三方用 `<featureId>:<name>` 前缀）。 */
  id: string
  title: string
  component: Component
  /** 槽位偏好：出厂/回落时的落点（用户分配定终局，偏好只建议）。 */
  preferredSlot?: DetailSlotId
}

const views: DetailViewEntry[] = []

/** 注册视图（同 id 重复注册 = 替换旧条目，次序不变）。 */
export function registerDetailView(view: DetailViewEntry): void {
  const idx = views.findIndex((v) => v.id === view.id)
  if (idx >= 0) views.splice(idx, 1)
  views.push(view)
}

/** 按 id 注销（功能组件卸载/停用时）。 */
export function unregisterDetailView(id: string): void {
  const idx = views.findIndex((v) => v.id === id)
  if (idx >= 0) views.splice(idx, 1)
}

export function getDetailView(id: string): DetailViewEntry | null {
  return views.find((v) => v.id === id) ?? null
}

/** 已注册视图（注册序 = 出厂落位序与回落序）。 */
export function listDetailViews(): readonly DetailViewEntry[] {
  return views
}

/** 注册表 → 槽位规则的已知视图事实（id + 偏好）。 */
export function knownViews(): KnownView[] {
  return views.map((v) => ({ id: v.id, preferredSlot: v.preferredSlot }))
}

// ---- 内置视图（D39 出厂分配：中心=预览、右=信息面、底=预览条） -------------------

/** 注册三个内置视图（main.ts 启动期调用；注册序即出厂 tab 序）。 */
export function registerBuiltinDetailViews(): void {
  registerDetailView({
    id: 'builtin.preview',
    title: i18n.global.t('wb.views.preview'),
    component: PreviewCenter,
    preferredSlot: 'center'
  })
  registerDetailView({
    id: 'builtin.info',
    title: i18n.global.t('wb.views.info'),
    component: InfoSurface,
    preferredSlot: 'right'
  })
  registerDetailView({
    id: 'builtin.filmstrip',
    title: i18n.global.t('wb.views.filmstrip'),
    component: FilmstripView,
    preferredSlot: 'bottom'
  })
}
