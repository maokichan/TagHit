import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@shared/api'
import type { Id, Workspace, WorkspaceRoot } from '@shared/contract'

/**
 * 工作区 store（0.2 模型）：工作区 = 名称 + 来源根集合。
 * 旧版封面/改名/路径行 id 等不在契约 v0，对应能力降级。
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaces = ref<Workspace[]>([])
  const loading = ref(false)
  /**
   * 列表加载失败的原因。**必须暴露**：refresh 失败若只把异常抛出便无人接管，
   * 界面表现为"一个工作区卡片都没有"，看起来像数据丢了，其实是调用断了。
   */
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      workspaces.value = await api.workspaces.list()
    } catch (e) {
      workspaces.value = []
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function create(name: string): Promise<Workspace> {
    const ws = await api.workspaces.create(name)
    await refresh()
    return ws
  }

  async function remove(id: Id): Promise<void> {
    await api.workspaces.remove(id)
    invalidateRoots(id)
    await refresh()
  }

  /** 挂来源根（递归收录，扫描时建视图）。 */
  async function addPath(workspaceId: Id, path: string): Promise<void> {
    await api.workspaces.mountRoot(workspaceId, path)
    invalidateRoots(workspaceId)
  }

  async function removePath(workspaceId: Id, path: string): Promise<void> {
    await api.workspaces.unmountRoot(workspaceId, path)
    invalidateRoots(workspaceId)
  }

  // ── 来源根缓存（渲染层单点真相）：顶栏扫描钮的 hasPaths 与来源根面板共用一份，
  //    变更口只有 addPath/removePath/remove，失效收口在此，消费方读 rootsOf + rootsVersion。

  const rootsCache = ref(new Map<Id, WorkspaceRoot[]>())
  const rootsVersion = ref(0)

  function invalidateRoots(workspaceId?: Id): void {
    if (workspaceId == null) {
      rootsCache.value = new Map()
    } else {
      const next = new Map(rootsCache.value)
      next.delete(workspaceId)
      rootsCache.value = next
    }
    rootsVersion.value += 1
  }

  async function listRoots(workspaceId: Id): Promise<WorkspaceRoot[]> {
    const hit = rootsCache.value.get(workspaceId)
    if (hit != null) return hit
    const roots = await api.workspaces.listRoots(workspaceId)
    rootsCache.value.set(workspaceId, roots)
    return roots
  }

  /** 读时补拉（缓存缺失才发请求）：常驻消费方 watch rootsVersion 即可，无需各自编排刷新。 */
  async function ensureRoots(workspaceId: Id): Promise<void> {
    if (!rootsCache.value.has(workspaceId)) await listRoots(workspaceId)
  }

  function rootsOf(workspaceId: Id): WorkspaceRoot[] {
    return rootsCache.value.get(workspaceId) ?? []
  }

  function byId(id: Id): Workspace | undefined {
    return workspaces.value.find((w) => w.id === id)
  }

  return {
    workspaces,
    loading,
    error,
    refresh,
    create,
    remove,
    addPath,
    removePath,
    listRoots,
    ensureRoots,
    rootsOf,
    rootsVersion,
    byId
  }
})
