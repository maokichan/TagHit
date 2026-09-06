import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Tag, TagNode } from '@shared/types/tag'

export const useTagStore = defineStore('tag', () => {
  /** 当前工作区已声明的标签（工作区标签页内管理视图） */
  const tags = ref<Tag[]>([])
  /** 全部全局标签池（设置/声明用） */
  const allTags = ref<Tag[]>([])
  /** 全部标签 + 层级关系（设置页统一管理用） */
  const tagNodes = ref<TagNode[]>([])
  const loading = ref(false)

  /** 刷新全局标签池（可选带关系） */
  async function refreshAll(includeRelations = false): Promise<void> {
    loading.value = true
    try {
      allTags.value = await window.api.tag.list()
      if (includeRelations) {
        tagNodes.value = await window.api.tag.listWithRelations()
      }
    } finally {
      loading.value = false
    }
  }

  /** 刷新某工作区已声明的标签 */
  async function refreshForWorkspace(workspaceId: number): Promise<void> {
    loading.value = true
    try {
      tags.value = await window.api.tag.listForWorkspace(workspaceId)
    } finally {
      loading.value = false
    }
  }

  /** 创建标签（全局），可同时声明到某工作区 */
  async function create(
    name: string,
    description: string | undefined,
    workspaceId?: number
  ): Promise<Tag> {
    const tag = await window.api.tag.create({ name, description, workspaceId })
    await refreshAll()
    if (workspaceId != null) await refreshForWorkspace(workspaceId)
    return tag
  }

  async function remove(id: number): Promise<void> {
    await window.api.tag.remove(id)
    await refreshAll()
  }

  /** 在某工作区声明全局标签 */
  async function declare(workspaceId: number, tagId: number): Promise<void> {
    await window.api.tag.declare({ workspaceId, tagId })
    await refreshForWorkspace(workspaceId)
    await refreshAll()
  }

  /** 取消在某工作区声明 */
  async function undeclare(workspaceId: number, tagId: number): Promise<void> {
    await window.api.tag.undeclare({ workspaceId, tagId })
    await refreshForWorkspace(workspaceId)
    await refreshAll()
  }

  function byId(id: number): Tag | undefined {
    return tags.value.find((t) => t.id === id)
  }

  return {
    tags,
    allTags,
    tagNodes,
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
