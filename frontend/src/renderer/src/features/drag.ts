/**
 * 拖出应用（移交）—— 壳级动作：**意图在壳，交付在宿主**。
 *
 * 分工（这是本文件存在的理由）：
 * - 手势与"操作对象集"归壳（与右键菜单同款）：拖拽从哪个卡片起手、要不要带出整个多选集，
 *   由 App.vue 的拦截点按**同一份 DOM 契约**（`data-ctx-target`）与**同一条投影规则**判定；
 * - 交付归宿主：真实路径必须由主进程 `webContents.startDrag` 交出，且路径只由宿主查库 + 过白名单
 *   （渲染层交条目 id，不交路径）；
 * - **预检归渲染层**：单向通道没有回程（见 ipc.ts 的 IpcSendContracts），所以"哪些条目根本没有可交付的
 *   文件"必须在这里查清楚并明确告知——否则用户看到的是"拖了没反应"，正是本项目反复消灭的那类缺陷。
 */

import { api } from '@shared/api'
import { useItemStore } from '../stores/item'
import { showToast } from './services/dialog'
import type { Id } from '@shared/contract'

/**
 * 交付这批条目：先按当前视图过滤出**真有来源文件**的，再交给宿主发起原生拖动。
 * 跳过的两类都必须说清楚：作品锚点（无来源）与已缺失的文件（磁盘上已不在）。
 */
export function startItemDrag(ids: Id[]): void {
  if (ids.length === 0) return
  const itemStore = useItemStore()
  const inView = new Map(itemStore.items.map((i) => [i.id, i]))

  const deliverable: Id[] = []
  let noSource = 0
  let missing = 0
  for (const id of ids) {
    const item = inView.get(id)
    if (item == null) continue // 不在当前视图（已翻页/删除）：不是"跳过"，而是无从判断
    if (item.sourceUri == null) {
      noSource++
      continue
    }
    if (item.status === 'missing') {
      missing++
      continue
    }
    deliverable.push(id)
  }

  if (deliverable.length === 0) {
    const why = missing > 0 ? '文件已缺失（磁盘上找不到）' : noSource > 0 ? '没有来源文件（作品锚点）' : '不在当前视图'
    showToast(`无法拖出：${why}`, 'error')
    return
  }
  if (noSource > 0 || missing > 0) {
    const parts: string[] = []
    if (missing > 0) parts.push(`${missing} 项文件已缺失`)
    if (noSource > 0) parts.push(`${noSource} 项没有来源文件`)
    showToast(`已跳过 ${parts.join('、')}；拖出 ${deliverable.length} 项`, 'info')
  }
  api.drag.start(deliverable)
}
