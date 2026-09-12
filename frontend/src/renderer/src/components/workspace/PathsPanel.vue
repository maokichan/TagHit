<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Archive,
  ChevronRight,
  Eye,
  EyeOff,
  FolderOpen,
  Focus,
  HelpCircle,
  Plus,
  Trash2,
  X
} from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useItemStore } from '../../stores/item'
import { api } from '@shared/api'
import { confirmDialog } from '../../features/services/dialog'
import { formatDate } from '../../lib/format'
import type {
  NodeState,
  PathNode,
  RetiredRootView,
  RootManagementView,
  VisibilitySummary,
  WorkspaceRoot
} from '@shared/contract'

/**
 * 来源根面板 v2：每个来源根 = 一个可折叠的目录树容器（资源管理器式逐级展开，任意深度）。
 * 节点 = 扫描发现的目录（含根）；树形由目录路径前缀关系派生（不另存父指针）。
 *
 * 两种"看少一点"的手段在这里区分得很清楚（2026-09-12 修订，此前只有前者、被当成扫描漏扫）：
 * - **只看此节点（范围）**：视图状态，不改任何节点状态，一键退出 →「我就想看其中一个节点」用它；
 * - **可见性（included/excluded）**：成员前提，逐节点、不级联，持久留在库里 → 长期隐藏某类目录用它。
 * 面板顶部常驻可见性摘要（可见/被排除/无节点归属），避免"排除了却以为扫描漏了"。
 */
const props = defineProps<{ workspaceId: string; side?: 'left' | 'right' }>()
const workspaceStore = useWorkspaceStore()
const itemStore = useItemStore()

const roots = ref<WorkspaceRoot[]>([])
const nodes = ref<PathNode[]>([])
const summary = ref<VisibilitySummary | null>(null)
/** 路径管理视图：退役根（卸载记录）+ 无记录脱根条目。 */
const mgmt = ref<RootManagementView | null>(null)
const showUntracked = ref(false)
const error = ref('')
/** 展开的目录（dirPath 集合）；来源根容器默认展开一级。 */
const expanded = ref<Set<string>>(new Set())

async function refresh(): Promise<void> {
  try {
    roots.value = await workspaceStore.listRoots(props.workspaceId)
    nodes.value = await api.nodes.list(props.workspaceId)
    summary.value = await api.workspaces.visibility(props.workspaceId)
    mgmt.value = await api.workspaces.rootManagement(props.workspaceId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
onMounted(refresh)
watch(() => props.workspaceId, refresh)
// 扫描完成（含挂载触发的自动扫描）后刷新节点树——addPath 的 refresh 先于扫描完成
watch(
  () => itemStore.lastScanResult,
  () => void refresh()
)

// 新根挂载后默认展开一级
watch(roots, (rs) => {
  for (const r of rs) {
    if (!expanded.value.has(r.path)) expanded.value = new Set(expanded.value).add(r.path)
  }
})

interface TreeNode {
  dirPath: string
  name: string
  state: NodeState
  children: TreeNode[]
}

/** 由节点全集派生树（根路径 → 顶层子目录）：父 = 直接父目录；父节点缺失时挂所属根顶层。 */
const tree = computed<Map<string, TreeNode[]>>(() => {
  const rootsSet = new Set(roots.value.map((r) => r.path))
  const sorted = [...nodes.value]
    .filter((n) => rootsSet.has(n.dirPath) || roots.value.some((r) => n.dirPath.startsWith(`${r.path}/`)))
    .sort((a, b) => (a.dirPath < b.dirPath ? -1 : 1))
  const byPath = new Map<string, TreeNode>(
    sorted.map((n) => [
      n.dirPath,
      { dirPath: n.dirPath, name: n.dirPath.slice(n.dirPath.lastIndexOf('/') + 1), state: n.state, children: [] }
    ])
  )
  const topLevel = new Map<string, TreeNode[]>()
  for (const n of sorted) {
    if (rootsSet.has(n.dirPath)) continue // 根节点自身 = 容器头，不进树
    const slash = n.dirPath.lastIndexOf('/')
    const parent = byPath.get(slash < 0 ? '' : n.dirPath.slice(0, slash))
    const self = byPath.get(n.dirPath)!
    if (parent != null && !rootsSet.has(parent.dirPath)) {
      parent.children.push(self)
    } else {
      // 父 = 来源根，或父节点缺失（未扫描到）→ 挂所属根顶层
      const root = roots.value.find((r) => n.dirPath === r.path || n.dirPath.startsWith(`${r.path}/`))
      if (root != null) {
        const list = topLevel.get(root.path) ?? []
        list.push(self)
        topLevel.set(root.path, list)
      }
    }
  }
  const byName = (a: TreeNode, b: TreeNode): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  for (const t of byPath.values()) t.children.sort(byName)
  for (const list of topLevel.values()) list.sort(byName)
  return topLevel
})

interface TreeRow {
  node: TreeNode
  depth: number
}

/** 某根容器下的可见行：按 expanded 铺平（任意深度）。 */
function rowsFor(rootPath: string): TreeRow[] {
  const out: TreeRow[] = []
  const walk = (list: TreeNode[], depth: number): void => {
    for (const t of list) {
      out.push({ node: t, depth })
      if (expanded.value.has(t.dirPath)) walk(t.children, depth + 1)
    }
  }
  if (expanded.value.has(rootPath)) walk(tree.value.get(rootPath) ?? [], 1)
  return out
}

function toggleExpand(dirPath: string): void {
  const next = new Set(expanded.value)
  if (next.has(dirPath)) next.delete(dirPath)
  else next.add(dirPath)
  expanded.value = next
}

/** 可见性切换；shift = 子树批量（含自身 + 全部后代）。根节点同样可切换。 */
async function setState(node: { dirPath: string; state: NodeState }, state: NodeState, cascade: boolean): Promise<void> {
  error.value = ''
  try {
    if (cascade) await api.nodes.setSubtreeState(props.workspaceId, node.dirPath, state)
    else await api.nodes.setState(props.workspaceId, node.dirPath, state)
    await refresh()
    // 可见性变更影响浏览投影 → 失效重查
    void itemStore.load(props.workspaceId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

/** 只看此节点（范围）：视图状态，不改节点可见性；再点一次或点提示条退出。 */
function toggleScope(dirPath: string): void {
  itemStore.setScope(itemStore.scopeDirPath === dirPath ? null : dirPath)
  void itemStore.load(props.workspaceId)
}

function clearScope(): void {
  itemStore.setScope(null)
  void itemStore.load(props.workspaceId)
}

/** 一键恢复全部可见：把本工作区所有 excluded 节点调回 included（逐节点单事务入口，Shift 语义同款）。 */
async function restoreAllVisible(): Promise<void> {
  error.value = ''
  try {
    const excluded = nodes.value.filter((n) => n.state === 'excluded')
    for (const n of excluded) await api.nodes.setState(props.workspaceId, n.dirPath, 'included')
    await refresh()
    void itemStore.load(props.workspaceId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

/** 根节点的当前可见性（扫描后存在；扫描前缺省 included）。 */
function rootState(rootPath: string): NodeState {
  return nodes.value.find((n) => n.dirPath === rootPath)?.state ?? 'included'
}

/** 当前范围末段名（提示条显示用）。 */
const scopedName = computed(() => {
  const p = itemStore.scopeDirPath
  if (p == null) return ''
  const i = p.lastIndexOf('/')
  return i < 0 ? p : p.slice(i + 1)
})

/** 挂载来源根：原生目录选择器（不再手输路径）；归一化在用例边界执行。 */
async function pickRoot(): Promise<void> {
  error.value = ''
  try {
    const path = await api.dialog.pickDirectory()
    if (path == null) return
    await workspaceStore.addPath(props.workspaceId, path)
    await refresh()
    void itemStore.scan(props.workspaceId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function removePath(root: WorkspaceRoot): Promise<void> {
  // 确认走壳的服务面（不再 window.confirm）
  const ok = await confirmDialog({
    title: '移除来源根',
    message: `确定从工作区移除路径「${root.path}」？\n其下条目将脱离本工作区视图（条目/标签保留，重新挂载即可恢复）。`,
    confirmText: '移除',
    danger: true
  })
  if (!ok) return
  await workspaceStore.removePath(props.workspaceId, root.path)
  await refresh()
  void itemStore.scan(props.workspaceId)
}

/** 重新挂载退役根：条目归属即刻恢复为可见（节点树由随后的扫描重建）。 */
async function restoreRetired(row: RetiredRootView): Promise<void> {
  error.value = ''
  try {
    await workspaceStore.addPath(props.workspaceId, row.path)
    await refresh()
    void itemStore.scan(props.workspaceId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

/** 挂载无记录脱根条目所在的目录（去留里的"留"）：扫描后这些条目重新可见。 */
async function mountGroup(dirPath: string): Promise<void> {
  error.value = ''
  try {
    await workspaceStore.addPath(props.workspaceId, dirPath)
    await refresh()
    void itemStore.scan(props.workspaceId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

/** 清理脱根条目（不可恢复）：删条目 + 其标签挂载；在来源根下的条目受保护（宿主侧构造保证）。 */
async function purgeDetached(dirPath: string | null, label: string, count: number): Promise<void> {
  error.value = ''
  const ok = await confirmDialog({
    title: '清理脱根条目',
    message: `将删除「${label}」下 ${count} 条脱根条目及其标签挂载，**不可恢复**。\n这些文件在磁盘上不会被删除；仍在来源根下的条目不受影响。`,
    confirmText: '删除条目',
    danger: true
  })
  if (!ok) return
  try {
    const res = await api.workspaces.cleanupDetached({ workspaceId: props.workspaceId, dirPath })
    await refresh()
    void itemStore.load(props.workspaceId)
    if (res.deleted === 0) error.value = '没有可清理的脱根条目（可能已被清理或已挂回来源根）'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <aside
    class="w-72 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3">
      <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">来源根</div>

      <!-- 可见性摘要：解释"为什么看不到全部内容"（可见 / 被排除隐藏 / 无节点归属） -->
      <div
        v-if="summary"
        class="mb-2 px-2 py-1.5 rounded text-[11px] leading-relaxed bg-[var(--bg)] border border-[var(--border)]"
      >
        <div class="flex items-center gap-2 flex-wrap">
          <span>可见 <b class="tabular-nums">{{ summary.visible }}</b></span>
          <span v-if="summary.hiddenByExcluded" class="text-[var(--danger)]">
            已排除隐藏 <b class="tabular-nums">{{ summary.hiddenByExcluded }}</b>
          </span>
          <span v-if="summary.nodeMissing" class="text-[var(--fg-dim)]">
            无归属 <b class="tabular-nums">{{ summary.nodeMissing }}</b>
          </span>
          <button
            v-if="summary.hiddenByExcluded"
            class="ml-auto underline cursor-pointer hover:text-[var(--accent)]"
            title="把所有被排除的目录恢复为可见（逐节点；不改动未排除目录）"
            @click="restoreAllVisible"
          >
            恢复全部
          </button>
        </div>
        <div
          v-if="summary.nodeMissing"
          class="mt-1 text-[var(--fg-dim)] opacity-80"
          title="条目仍在库中（文件可能还在磁盘上），只是其所在目录已消失或未被扫描到；重新挂载对应来源根并扫描即可恢复"
        >
          无归属：所在目录已消失或未被扫描到
        </div>
      </div>

      <!-- 当前范围（只看某节点）：视图状态，不写库；一键退出 -->
      <div
        v-if="itemStore.scopeDirPath"
        class="mb-2 flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] bg-[var(--accent-soft)] text-[var(--accent)]"
      >
        <Focus :size="11" class="shrink-0" />
        <span class="truncate flex-1" :title="itemStore.scopeDirPath">只看：{{ scopedName }}</span>
        <button class="cursor-pointer hover:brightness-110" title="退出范围（回到全部可见条目）" @click="clearScope">
          <X :size="11" />
        </button>
      </div>

      <!-- 来源根之间用分割线分离（不用圆角容器包目录树） -->
      <div v-if="roots.length" class="divide-y divide-[var(--border)]">
        <div v-for="r in roots" :key="r.path" class="text-[12px] py-1">
          <!-- 容器头：根目录（可见性同样可切换） -->
          <div class="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[var(--bg-hover)]">
            <button
              class="shrink-0 flex items-center justify-center w-4 h-4 cursor-pointer text-[var(--fg-dim)] hover:text-[var(--fg)]"
              :title="expanded.has(r.path) ? '折叠' : '展开'"
              @click="toggleExpand(r.path)"
            >
              <ChevronRight :size="12" class="transition-transform" :class="{ 'rotate-90': expanded.has(r.path) }" />
            </button>
            <button
              class="shrink-0 cursor-pointer transition-colors"
              :class="rootState(r.path) === 'included' ? 'text-[var(--accent)]' : 'text-[var(--fg-dim)] opacity-50'"
              :title="rootState(r.path) === 'included'
                ? '已包含：根目录直接条目可见（点击排除；Shift+点击 = 含全部子目录）'
                : '已排除：根目录直接条目退出视图（点击包含；Shift+点击 = 含全部子目录）'"
              @click="setState({ dirPath: r.path, state: rootState(r.path) }, rootState(r.path) === 'included' ? 'excluded' : 'included', $event.shiftKey)"
            >
              <Eye v-if="rootState(r.path) === 'included'" :size="12" />
              <EyeOff v-else :size="12" />
            </button>
            <FolderOpen :size="13" class="shrink-0 text-[var(--accent)]" />
            <span class="truncate flex-1 font-medium cursor-pointer" :title="r.path" @click="toggleExpand(r.path)">
              {{ r.path }}
            </span>
            <button
              class="shrink-0 cursor-pointer transition-colors"
              :class="itemStore.scopeDirPath === r.path ? 'text-[var(--accent)]' : 'text-[var(--fg-dim)] hover:text-[var(--accent)]'"
              :title="itemStore.scopeDirPath === r.path ? '退出范围（回到全部可见条目）' : '只看此节点（含其子目录；不改可见性）'"
              @click.stop="toggleScope(r.path)"
            >
              <Focus :size="12" />
            </button>
            <button
              class="text-[var(--fg-dim)] hover:text-[var(--danger)] cursor-pointer shrink-0"
              title="移除来源根"
              @click.stop="removePath(r)"
            >
              <Trash2 :size="12" />
            </button>
          </div>

          <!-- 子目录树：逐级展开；行内 = 可见性眼 + 目录名 -->
          <div v-if="expanded.has(r.path)" class="pb-1.5">
            <div
              v-for="row in rowsFor(r.path)"
              :key="row.node.dirPath"
              class="group flex items-center gap-1.5 pr-2 py-1 hover:bg-[var(--bg-hover)]"
              :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
            >
              <button
                v-if="row.node.children.length"
                class="shrink-0 flex items-center justify-center w-3.5 h-3.5 cursor-pointer text-[var(--fg-dim)] hover:text-[var(--fg)]"
                :title="expanded.has(row.node.dirPath) ? '折叠' : '展开'"
                @click="toggleExpand(row.node.dirPath)"
              >
                <ChevronRight
                  :size="11"
                  class="transition-transform"
                  :class="{ 'rotate-90': expanded.has(row.node.dirPath) }"
                />
              </button>
              <span v-else class="w-3.5 shrink-0" />
              <button
                class="shrink-0 cursor-pointer transition-colors"
                :class="row.node.state === 'included' ? 'text-[var(--accent)]' : 'text-[var(--fg-dim)] opacity-50'"
                :title="row.node.state === 'included'
                  ? '已包含：直接条目可见（点击排除；Shift+点击 = 含全部子目录）'
                  : '已排除：直接条目退出视图（点击包含；Shift+点击 = 含全部子目录）'"
                @click="setState(row.node, row.node.state === 'included' ? 'excluded' : 'included', $event.shiftKey)"
              >
                <Eye v-if="row.node.state === 'included'" :size="12" />
                <EyeOff v-else :size="12" />
              </button>
              <span
                class="truncate flex-1"
                :class="[
                  row.node.children.length ? 'cursor-pointer' : '',
                  row.node.state === 'included' ? '' : 'text-[var(--fg-dim)] opacity-60 line-through'
                ]"
                :title="row.node.dirPath"
                @click="row.node.children.length && toggleExpand(row.node.dirPath)"
              >
                {{ row.node.name }}
              </span>
              <button
                class="shrink-0 cursor-pointer transition-colors"
                :class="itemStore.scopeDirPath === row.node.dirPath
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--fg-dim)] opacity-0 group-hover:opacity-100 hover:text-[var(--accent)]'"
                :title="itemStore.scopeDirPath === row.node.dirPath ? '退出范围（回到全部可见条目）' : '只看此节点（含其子目录；不改可见性）'"
                @click.stop="toggleScope(row.node.dirPath)"
              >
                <Focus :size="11" />
              </button>
            </div>
            <div v-if="!rowsFor(r.path).length" class="pl-6 pr-2 py-1 text-[11px] text-[var(--fg-dim)] opacity-70">
              无子目录（重新扫描后出现）
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-[12px] text-[var(--fg-dim)] px-1 mb-1">尚未挂载来源根</div>

      <div
        v-if="error"
        class="mt-2 px-2 py-1.5 rounded text-[11px]"
        style="background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger)"
      >
        {{ error }}
        <button class="ml-1 cursor-pointer opacity-70 hover:opacity-100" @click="error = ''">✕</button>
      </div>

      <button
        class="btn text-[12px] w-full justify-center mt-2"
        title="打开系统目录选择器"
        @click="pickRoot"
      >
        <Plus :size="13" />
        选择目录…
      </button>

      <!-- 已卸载的来源根（退役根）：条目仍在库中，去留在此决定 -->
      <div
        v-if="mgmt && (mgmt.retired.length || mgmt.untrackedTotal)"
        class="mt-3 pt-2.5 border-t border-[var(--border)]"
      >
        <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-1.5">
          已卸载的来源根
        </div>

        <div
          v-for="row in mgmt.retired"
          :key="row.path"
          class="px-2 py-1.5 rounded text-[12px] hover:bg-[var(--bg-hover)]"
        >
          <div class="flex items-center gap-1.5">
            <Archive :size="12" class="shrink-0 text-[var(--fg-dim)]" />
            <span class="truncate flex-1" :title="row.path">{{ row.path }}</span>
            <span class="text-[11px] text-[var(--fg-dim)] tabular-nums shrink-0">{{ row.itemCount }} 条</span>
          </div>
          <div class="mt-1 flex items-center gap-2.5 pl-5 text-[11px]">
            <button
              class="underline cursor-pointer hover:text-[var(--accent)]"
              title="把该目录重新挂回本工作区；随后扫描即恢复条目可见"
              @click="restoreRetired(row)"
            >
              重新挂载
            </button>
            <button
              class="underline cursor-pointer hover:text-[var(--danger)]"
              title="删除该根下的全部条目及其标签挂载（不可恢复；磁盘文件不动）"
              @click="purgeDetached(row.path, row.path, row.itemCount)"
            >
              清理条目…
            </button>
            <span class="ml-auto text-[var(--fg-dim)] opacity-70">卸载于 {{ formatDate(row.retiredAt) }}</span>
          </div>
        </div>

        <!-- 无记录的历史残留（卸载记录机制落地前卸载的根） -->
        <div v-if="mgmt.untrackedTotal" class="px-2 py-1.5 rounded text-[12px]">
          <div class="flex items-center gap-1.5">
            <HelpCircle :size="12" class="shrink-0 text-[var(--fg-dim)]" />
            <span class="flex-1" title="有来源但没有任何来源根覆盖的条目：无卸载记录可归因（旧版遗留）">无记录的脱根条目</span>
            <span class="text-[11px] text-[var(--fg-dim)] tabular-nums shrink-0">{{ mgmt.untrackedTotal }} 条</span>
            <button
              class="text-[11px] underline cursor-pointer hover:text-[var(--accent)] shrink-0"
              @click="showUntracked = !showUntracked"
            >
              {{ showUntracked ? '收起' : '目录…' }}
            </button>
          </div>
          <div v-if="showUntracked" class="mt-1 pl-5 max-h-44 overflow-y-auto">
            <div
              v-for="g in mgmt.untrackedGroups"
              :key="g.dirPath"
              class="flex items-center gap-1.5 py-0.5"
            >
              <span class="truncate flex-1 text-[11px] text-[var(--fg-dim)]" :title="g.dirPath">
                {{ g.dirPath }}
              </span>
              <span class="text-[11px] tabular-nums text-[var(--fg-dim)] shrink-0">{{ g.count }}</span>
              <button
                class="text-[11px] underline cursor-pointer hover:text-[var(--accent)] shrink-0"
                title="把此目录挂为本工作区来源根（随后扫描即让这些条目重新可见）"
                @click="mountGroup(g.dirPath)"
              >
                挂载
              </button>
              <button
                class="text-[11px] underline cursor-pointer hover:text-[var(--danger)] shrink-0"
                title="清理此目录及其子目录下的脱根条目（不可恢复）"
                @click="purgeDetached(g.dirPath, g.dirPath, g.count)"
              >
                清理
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
