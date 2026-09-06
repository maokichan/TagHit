export interface Tag {
  id: number
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  /** 已声明该标签的工作区 id 列表（统一管理视图用，可选） */
  workspaceIds?: number[]
}

export interface TagHierarchy {
  parentId: number
  childId: number
}

/** 标签及其父子关系（用于标签管理页） */
export interface TagNode extends Tag {
  parents: Tag[]
  children: Tag[]
}

export interface CreateTagRequest {
  name: string
  description?: string
  /** 创建后立即声明到该工作区（可选；标签定义本身是全局的） */
  workspaceId?: number
}

export interface AddHierarchyRequest {
  parentId: number
  childId: number
}

/** 在某工作区声明/取消声明一个全局标签 */
export interface DeclareTagRequest {
  workspaceId: number
  tagId: number
}
