/**
 * 路径管理（来源根）——数据与动作的**复用单元**，供两种呈现面共用：
 * 停靠面板（features/paths/PathsPanel.vue）与全页呈现（features/paths/PathsFullPage.vue）。
 *
 * 为什么抽出来：同一功能组件的两种呈现面各自布局不同（窄面板 vs 两栏全页），
 * 但取数与动作必须同一份——否则就是"两个实现"，早晚漂移。呈现面差异只留在模板里；
 * 组件级复用见 RootTree / VisibilitySummaryBar / RelocationPanel。
 *
 * 跨实例一致性：停靠面板与全页面可能同时挂着（同一功能的两个呈现面），
 * 任一实例的动作经模块级 revision 广播，其余实例失效重查。
 */

import { computed, inject, provide, ref, watch, type InjectionKey, type Ref } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useItemStore } from '../../stores/item'
import { api } from '@shared/api'
import { confirmDialog } from '../services/dialog'
import { formatDate } from '../../lib/format'
import type {
  NodeState,
  PathNode,
  RetiredRootView,
  RootManagementView,
  VisibilitySummary,
  WorkspaceRoot
} from '@shared/contract'

/** 模块级修订号：任一路径管理动作完成后自增，所有在挂实例据此重查（跨呈现面一致性）。 */
const revision = ref(0)

function bump(): void {
  revision.value++
}

export interface TreeNode {
  dirPath: string
  name: string
  state: NodeState
  children: TreeNode[]
}

/** 某根容器下的可见行：按 expanded 铺平（任意深度）。 */
export interface TreeRow {
  node: TreeNode
  depth: number
}

export interface PathManagement {
  workspaceId: string
  roots: Ref<WorkspaceRoot[]>
  nodes: Ref<PathNode[]>
  summary: Ref<VisibilitySummary | null>
  mgmt: Ref<RootManagementView | null>
  error: Ref<string>
  expanded: Ref<Set<string>>
  refresh: () => Promise<void>
  treeFor: (rootPath: string) => TreeNode[]
  rowsFor: (rootPath: string) => TreeRow[]
  toggleExpand: (dirPath: string) => void
  rootState: (rootPath: string) => NodeState
  setState: (
    node: { dirPath: string; state: NodeState },
    state: NodeState,
    cascade: boolean
  ) => Promise<void>
  toggleScope: (dirPath: string) => void
  clearScope: () => void
  scopedName: () => string
  /** 当前浏览范围（只看某节点）；null = 不限。 */
  scopeDirPath: Ref<string | null>
  isScope: (dirPath: string) => boolean
  restoreAllVisible: () => Promise<void>
  pickRoot: () => Promise<void>
  removePath: (root: WorkspaceRoot) => Promise<void>
  restoreRetired: (row: RetiredRootView) => Promise<void>
  mountGroup: (dirPath: string) => Promise<void>
  purgeDetached: (dirPath: string | null, label: string, count: number) => Promise<void>
  formatDate: (iso: string | null | undefined) => string
}

const KEY: InjectionKey<PathManagement> = Symbol('pathManagement')

export function createPathManagement(workspaceId: string): PathManagement {
  const workspaceStore = useWorkspaceStore()
  const itemStore = useItemStore()

  const roots = ref<WorkspaceRoot[]>([])
  const nodes = ref<PathNode[]>([])
  const summary = ref<VisibilitySummary | null>(null)
  const mgmt = ref<RootManagementView | null>(null)
  const error = ref('')
  const expanded = ref<Set<string>>(new Set())

  async function refresh(): Promise<void> {
    try {
      roots.value = await workspaceStore.listRoots(workspaceId)
      nodes.value = await api.nodes.list(workspaceId)
      summary.value = await api.workspaces.visibility(workspaceId)
      mgmt.value = await api.workspaces.rootManagement(workspaceId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  /** 树形由路径前缀派生（不另存父指针，与域模型一致）；父节点缺失则挂顶层。 */
  function treeFor(rootPath: string): TreeNode[] {
    const rootsSet = new Set(roots.value.map((r) => r.path))
    const scoped = nodes.value
      .filter((n) => rootPath === n.dirPath || n.dirPath.startsWith(`${rootPath}/`))
      .sort((a, b) => (a.dirPath < b.dirPath ? -1 : 1))
    const byPath = new Map<string, TreeNode>(
      scoped.map((n) => [
        n.dirPath,
        {
          dirPath: n.dirPath,
          name: n.dirPath.slice(n.dirPath.lastIndexOf('/') + 1),
          state: n.state,
          children: []
        }
      ])
    )
    const topLevel: TreeNode[] = []
    for (const n of scoped) {
      if (rootsSet.has(n.dirPath)) continue // 根节点自身 = 容器头，不进树
      const slash = n.dirPath.lastIndexOf('/')
      const parentPath = slash < 0 ? '' : n.dirPath.slice(0, slash)
      const self = byPath.get(n.dirPath)!
      const parent = byPath.get(parentPath)
      if (parent != null && !rootsSet.has(parentPath)) parent.children.push(self)
      else topLevel.push(self)
    }
    sortDeep(topLevel)
    return topLevel
  }

  function sortDeep(list: TreeNode[]): void {
    const byName = (a: TreeNode, b: TreeNode): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    list.sort(byName)
    for (const t of list) sortDeep(t.children)
  }

  function rowsFor(rootPath: string): TreeRow[] {
    const out: TreeRow[] = []
    const walk = (list: TreeNode[], depth: number): void => {
      for (const t of list) {
        out.push({ node: t, depth })
        if (expanded.value.has(t.dirPath)) walk(t.children, depth + 1)
      }
    }
    if (expanded.value.has(rootPath)) walk(treeFor(rootPath), 1)
    return out
  }

  function toggleExpand(dirPath: string): void {
    const next = new Set(expanded.value)
    if (next.has(dirPath)) next.delete(dirPath)
    else next.add(dirPath)
    expanded.value = next
  }

  function rootState(rootPath: string): NodeState {
    return nodes.value.find((n) => n.dirPath === rootPath)?.state ?? 'included'
  }

  function scopedName(): string {
    const p = itemStore.scopeDirPath
    if (p == null) return ''
    const i = p.lastIndexOf('/')
    return i < 0 ? p : p.slice(i + 1)
  }

  const scopeDirPath = computed(() => itemStore.scopeDirPath)
  function isScope(dirPath: string): boolean {
    return itemStore.scopeDirPath === dirPath
  }

  async function run(action: () => Promise<void>): Promise<void> {
    error.value = ''
    try {
      await action()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  /** 可见性切换；shift = 子树批量（含自身 + 全部后代）。根节点同样可切换。 */
  async function setState(
    node: { dirPath: string; state: NodeState },
    state: NodeState,
    cascade: boolean
  ): Promise<void> {
    await run(async () => {
      if (cascade) await api.nodes.setSubtreeState(workspaceId, node.dirPath, state)
      else await api.nodes.setState(workspaceId, node.dirPath, state)
      bump()
      void itemStore.load(workspaceId)
    })
  }

  /** 只看此节点（范围）：视图状态，不改节点可见性；再点一次或点提示条退出。 */
  function toggleScope(dirPath: string): void {
    itemStore.setScope(itemStore.scopeDirPath === dirPath ? null : dirPath)
    void itemStore.load(workspaceId)
  }

  function clearScope(): void {
    itemStore.setScope(null)
    void itemStore.load(workspaceId)
  }

  /** 一键恢复全部可见：把本工作区所有 excluded 节点调回 included（逐节点入口）。 */
  async function restoreAllVisible(): Promise<void> {
    await run(async () => {
      for (const n of nodes.value.filter((n) => n.state === 'excluded')) {
        await api.nodes.setState(workspaceId, n.dirPath, 'included')
      }
      bump()
      void itemStore.load(workspaceId)
    })
  }

  /** 挂载来源根：原生目录选择器（归一化在用例边界执行）。 */
  async function pickRoot(): Promise<void> {
    await run(async () => {
      const path = await api.dialog.pickDirectory()
      if (path == null) return
      await workspaceStore.addPath(workspaceId, path)
      bump()
      void itemStore.scan(workspaceId)
    })
  }

  async function removePath(root: WorkspaceRoot): Promise<void> {
    const ok = await confirmDialog({
      title: '移除来源根',
      message: `确定从工作区移除路径「${root.path}」？\n其下条目将脱离本工作区视图（条目/标签保留，可在「已卸载的来源根」里重新挂载或清理）。`,
      confirmText: '移除',
      danger: true
    })
    if (!ok) return
    await run(async () => {
      await workspaceStore.removePath(workspaceId, root.path)
      bump()
      void itemStore.scan(workspaceId)
    })
  }

  /** 重新挂载退役根：条目归属即刻恢复为可见（节点树由随后的扫描重建）。 */
  async function restoreRetired(row: RetiredRootView): Promise<void> {
    await run(async () => {
      await workspaceStore.addPath(workspaceId, row.path)
      bump()
      void itemStore.scan(workspaceId)
    })
  }

  /** 挂载无记录脱根条目所在的目录（去留里的"留"）：扫描后这些条目重新可见。 */
  async function mountGroup(dirPath: string): Promise<void> {
    await run(async () => {
      await workspaceStore.addPath(workspaceId, dirPath)
      bump()
      void itemStore.scan(workspaceId)
    })
  }

  /** 清理脱根条目（不可恢复）：删条目 + 其标签挂载；在来源根下的条目受保护（宿主侧构造保证）。 */
  async function purgeDetached(
    dirPath: string | null,
    label: string,
    count: number
  ): Promise<void> {
    const ok = await confirmDialog({
      title: '清理脱根条目',
      message: `将删除「${label}」下 ${count} 条脱根条目及其标签挂载，**不可恢复**。\n这些文件在磁盘上不会被删除；仍在来源根下的条目不受影响。`,
      confirmText: '删除条目',
      danger: true
    })
    if (!ok) return
    await run(async () => {
      const res = await api.workspaces.cleanupDetached({ workspaceId, dirPath })
      bump()
      void itemStore.load(workspaceId)
      if (res.deleted === 0) {
        error.value = '没有可清理的脱根条目（可能已被清理或已挂回来源根）'
      }
    })
  }

  // 挂载来源根后默认展开一级；扫描完成后刷新节点树（addPath 的刷新先于扫描完成）
  watch(roots, (list) => {
    const next = new Set(expanded.value)
    for (const r of list) next.add(r.path)
    expanded.value = next
  })
  watch(
    () => itemStore.lastScanResult,
    () => void refresh()
  )
  // 其他呈现面实例的动作 → 本实例失效重查
  watch(revision, () => void refresh())

  return {
    workspaceId,
    roots,
    nodes,
    summary,
    mgmt,
    error,
    expanded,
    refresh,
    treeFor,
    rowsFor,
    toggleExpand,
    rootState,
    setState,
    toggleScope,
    clearScope,
    scopedName,
    scopeDirPath,
    isScope,
    restoreAllVisible,
    pickRoot,
    removePath,
    restoreRetired,
    mountGroup,
    purgeDetached,
    formatDate
  }
}

/** 呈现面提供一次实例，其子块（树/摘要/脱根区）经注入共用同一份状态与动作。 */
export function providePathManagement(workspaceId: string): PathManagement {
  const pm = createPathManagement(workspaceId)
  provide(KEY, pm)
  return pm
}

export function usePathManagement(): PathManagement {
  const pm = inject(KEY, null)
  if (pm == null) throw new Error('usePathManagement 必须在 providePathManagement 之内使用')
  return pm
}
