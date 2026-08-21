import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AddPathRequest, WorkspaceWithPaths } from '@shared/types/workspace'

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaces = ref<WorkspaceWithPaths[]>([])
  const loading = ref(false)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      workspaces.value = await window.api.workspace.list()
    } finally {
      loading.value = false
    }
  }

  async function create(title: string): Promise<WorkspaceWithPaths> {
    const ws = await window.api.workspace.create(title)
    await refresh()
    return ws
  }

  async function remove(id: number): Promise<void> {
    await window.api.workspace.remove(id)
    await refresh()
  }

  async function update(id: number, title: string): Promise<WorkspaceWithPaths> {
    const ws = await window.api.workspace.update(id, title)
    await refresh()
    return ws
  }

  async function addPath(req: AddPathRequest): Promise<WorkspaceWithPaths> {
    const ws = await window.api.workspace.addPath(req)
    await refresh()
    return ws
  }

  async function removePath(pathId: number, workspaceId: number): Promise<WorkspaceWithPaths> {
    const ws = await window.api.workspace.removePath(pathId, workspaceId)
    await refresh()
    return ws
  }

  /** 设置工作区封面（null = 自动取工作区内图片） */
  async function setCover(id: number, coverPath: string | null): Promise<WorkspaceWithPaths> {
    const ws = await window.api.workspace.setCover(id, coverPath)
    await refresh()
    return ws
  }

  function byId(id: number): WorkspaceWithPaths | undefined {
    return workspaces.value.find((w) => w.id === id)
  }

  return {
    workspaces,
    loading,
    refresh,
    create,
    remove,
    update,
    addPath,
    removePath,
    setCover,
    byId
  }
})
