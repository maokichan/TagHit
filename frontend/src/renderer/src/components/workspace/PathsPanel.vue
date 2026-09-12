<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronRight, Eye, EyeOff, FolderOpen, Plus, Trash2 } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useItemStore } from '../../stores/item'
import { api } from '@shared/api'
import { confirmDialog } from '../../features/services/dialog'
import type { NodeState, PathNode, WorkspaceRoot } from '@shared/contract'

/**
 * 来源根面板 v2：每个来源根 = 一个可折叠的目录树容器（资源管理器式逐级展开，任意深度）。
 * 节点 = 扫描发现的目录（含根）；树形由目录路径前缀关系派生（不另存父指针）。
 * 可见性（included/excluded）不级联（域模型现状）——只作用于该目录的直接条目；
 * Shift+点击 = 子树批量设置（内核仍是逐节点批量入口，非级联语义）。
 * 变更后浏览投影即变：失效重查当前工作区条目。
 */
const props = defineProps<{ workspaceId: string; side?: 'left' | 'right' }>()
const workspaceStore = useWorkspaceStore()
const itemStore = useItemStore()

const roots = ref<WorkspaceRoot[]>([])
const nodes = ref<PathNode[]>([])
const newPath = ref('')
const error = ref('')
/** 展开的目录（dirPath 集合）；来源根容器默认展开一级。 */
const expanded = ref<Set<string>>(new Set())

async function refresh(): Promise<void> {
  try {
    roots.value = await workspaceStore.listRoots(props.workspaceId)
    nodes.value = await api.nodes.list(props.workspaceId)
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

/** 可见性切换；shift = 子树批量（含自身 + 全部后代）。 */
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

async function addPath(): Promise<void> {
  const path = newPath.value.trim()
  if (!path) return
  await workspaceStore.addPath(props.workspaceId, path)
  newPath.value = ''
  await refresh()
  // 目录变更后自动扫描，减少手动操作
  void itemStore.scan(props.workspaceId)
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
</script>

<template>
  <aside
    class="w-72 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3">
      <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">来源根</div>

      <!-- 每个来源根 = 一个树形容器 -->
      <div v-if="roots.length" class="space-y-2">
        <div v-for="r in roots" :key="r.path" class="rounded bg-[var(--bg)] text-[12px]">
          <!-- 容器头：根目录 -->
          <div class="flex items-center gap-1.5 px-2 py-1.5">
            <button
              class="shrink-0 flex items-center justify-center w-4 h-4 cursor-pointer text-[var(--fg-dim)] hover:text-[var(--fg)]"
              :title="expanded.has(r.path) ? '折叠' : '展开'"
              @click="toggleExpand(r.path)"
            >
              <ChevronRight :size="12" class="transition-transform" :class="{ 'rotate-90': expanded.has(r.path) }" />
            </button>
            <FolderOpen :size="13" class="shrink-0 text-[var(--accent)]" />
            <span class="truncate flex-1 font-medium cursor-pointer" :title="r.path" @click="toggleExpand(r.path)">
              {{ r.path }}
            </span>
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

      <div class="flex gap-1.5 mt-2">
        <input
          v-model="newPath"
          class="input text-[12px] flex-1 min-w-0"
          placeholder="绝对路径，如 D:\media"
          title="原生目录选择器待宿主能力落地，先手动输入绝对路径"
          @keyup.enter="addPath"
        />
        <button class="btn text-[12px]" title="挂载来源根" @click="addPath">
          <Plus :size="13" />
        </button>
      </div>
    </div>
  </aside>
</template>
