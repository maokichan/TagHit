import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@shared/api'
import type { Id, Tag } from '@shared/contract'

/**
 * 标签 store：全局标签池 + 工作区声明集。
 * 标签层级（TagNode/关联）不在契约 v0：设置页层级管理降级。
 */
export const useTagStore = defineStore('tag', () => {
  /** 全部全局标签池（设置/声明用），按名升序 */
  const allTags = ref<Tag[]>([])
  /** 当前工作区已声明的标签 id 集 */
  const declaredIds = ref<Id[]>([])
  /** 当前工作区已声明的标签（工作区标签页内管理视图） */
  const tags = computed<Tag[]>(() => {
    const declared = new Set(declaredIds.value)
    return allTags.value.filter((t) => declared.has(t.id))
  })
  const loading = ref(false)

  /** 刷新全局标签池（空文本 = 全部，按名升序） */
  async function refreshAll(): Promise<void> {
    loading.value = true
    try {
      allTags.value = await api.tags.search('')
    } finally {
      loading.value = false
    }
  }

  /** 刷新某工作区已声明的标签 */
  async function refreshForWorkspace(workspaceId: Id): Promise<void> {
    loading.value = true
    try {
      declaredIds.value = await api.workspaces.declaredTags(workspaceId)
    } finally {
      loading.value = false
    }
  }

  /** 创建标签（全局），可同时声明到某工作区 */
  async function create(
    name: string,
    description?: string,
    workspaceId?: Id
  ): Promise<Tag> {
    const tag = await api.tags.create({ name, description })
    await refreshAll()
    if (workspaceId != null) {
      await api.tags.declare(workspaceId, tag.id)
      await refreshForWorkspace(workspaceId)
    }
    return tag
  }

  async function remove(id: Id): Promise<void> {
    await api.tags.remove(id)
    await refreshAll()
  }

  /** 在某工作区声明全局标签 */
  async function declare(workspaceId: Id, tagId: Id): Promise<void> {
    await api.tags.declare(workspaceId, tagId)
    await refreshForWorkspace(workspaceId)
  }

  /** 取消在某工作区声明 */
  async function undeclare(workspaceId: Id, tagId: Id): Promise<void> {
    await api.tags.undeclare(workspaceId, tagId)
    await refreshForWorkspace(workspaceId)
  }

  function byId(id: Id): Tag | undefined {
    return allTags.value.find((t) => t.id === id)
  }

  return {
    tags,
    allTags,
    loading,
    refreshAll,
    refreshForWorkspace,
    create,
    remove,
    declare,
    undeclare,
    byId
  }
})
