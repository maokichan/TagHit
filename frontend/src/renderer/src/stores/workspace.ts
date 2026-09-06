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

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      workspaces.value = await api.workspaces.list()
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
    await refresh()
  }

  /** 挂来源根（递归收录，扫描时建视图）。 */
  async function addPath(workspaceId: Id, path: string): Promise<void> {
    await api.workspaces.mountRoot(workspaceId, path)
  }

  async function removePath(workspaceId: Id, path: string): Promise<void> {
    await api.workspaces.unmountRoot(workspaceId, path)
  }

  async function listRoots(workspaceId: Id): Promise<WorkspaceRoot[]> {
    return api.workspaces.listRoots(workspaceId)
  }

  function byId(id: Id): Workspace | undefined {
    return workspaces.value.find((w) => w.id === id)
  }

  return {
    workspaces,
    loading,
    refresh,
    create,
    remove,
    addPath,
    removePath,
    listRoots,
    byId
  }
})
