import type { AppDb } from '../../db/connection'
import type { ConfigService } from '../config'
import { tagDao } from './tag.dao'
import { workspaceDao } from '../workspace/workspace.dao'
import type {
  AddHierarchyRequest,
  CreateTagRequest,
  DeclareTagRequest,
  Tag,
  TagNode
} from '@shared/types/tag'

/**
 * TagService —— 标签 CRUD + 多父级层级 + BFS 防环。
 * 描述存于 config.tagDescriptions（可分享、不绑库），层级关系存 DB（DAG）。
 */
export class TagService {
  constructor(
    private readonly db: AppDb,
    private readonly config: ConfigService
  ) {}

  list(): Tag[] {
    const descriptions = this.config.get().tagDescriptions
    return tagDao.list(this.db).map((t) => ({
      ...t,
      description: descriptions[t.name] ?? null,
      workspaceIds: tagDao.listDeclaredWorkspaceIds(this.db, t.id)
    }))
  }

  /** 某工作区已声明的标签（含描述）——工作区标签页内的标签管理视图 */
  listForWorkspace(workspaceId: number): Tag[] {
    const descriptions = this.config.get().tagDescriptions
    const declaredIds = new Set(tagDao.listDeclaredTagIds(this.db, workspaceId))
    return tagDao
      .list(this.db)
      .filter((t) => declaredIds.has(t.id))
      .map((t) => ({ ...t, description: descriptions[t.name] ?? null }))
  }

  listWithRelations(): TagNode[] {
    const hierarchy = tagDao.listHierarchy(this.db)
    const childrenMap = new Map<number, number[]>()
    const parentsMap = new Map<number, number[]>()
    for (const { parentId, childId } of hierarchy) {
      childrenMap.set(parentId, [...(childrenMap.get(parentId) ?? []), childId])
      parentsMap.set(childId, [...(parentsMap.get(childId) ?? []), parentId])
    }
    const byId = new Map(tagDao.list(this.db).map((t) => [t.id, t]))
    const descriptions = this.config.get().tagDescriptions
    return tagDao.list(this.db).map((t) => ({
      ...t,
      description: descriptions[t.name] ?? null,
      workspaceIds: tagDao.listDeclaredWorkspaceIds(this.db, t.id),
      parents: (parentsMap.get(t.id) ?? []).map((id) => byId.get(id)).filter(Boolean) as Tag[],
      children: (childrenMap.get(t.id) ?? []).map((id) => byId.get(id)).filter(Boolean) as Tag[]
    }))
  }

  create(req: CreateTagRequest): Tag {
    const name = req.name.trim()
    if (!name) throw new Error('标签名不能为空')
    if (tagDao.getByName(this.db, name)) throw new Error(`标签「${name}」已存在`)
    const tag = tagDao.create(this.db, name)
    if (req.description) {
      const descriptions = { ...this.config.get().tagDescriptions, [name]: req.description }
      this.config.update({ tagDescriptions: descriptions })
      tag.description = req.description
    }
    // 标签定义始终是全局的；若指定工作区则同时声明，该工作区立即可见/可搜索
    if (req.workspaceId != null) {
      tagDao.declare(this.db, req.workspaceId, tag.id)
      tag.workspaceIds = [req.workspaceId]
    }
    return tag
  }

  /** 在某工作区声明一个全局标签（仅改变可见性） */
  declare(req: DeclareTagRequest): void {
    if (!tagDao.getById(this.db, req.tagId)) throw new Error('标签不存在')
    if (!workspaceDao.getById(this.db, req.workspaceId)) throw new Error('工作区不存在')
    tagDao.declare(this.db, req.workspaceId, req.tagId)
  }

  /** 取消在某工作区声明（不删除该工作区已有 item_tag 关联，重新声明即恢复） */
  undeclare(req: DeclareTagRequest): void {
    if (!tagDao.getById(this.db, req.tagId)) throw new Error('标签不存在')
    if (!workspaceDao.getById(this.db, req.workspaceId)) throw new Error('工作区不存在')
    tagDao.undeclare(this.db, req.workspaceId, req.tagId)
  }

  update(id: number, patch: { name?: string; description?: string }): Tag {
    const current = tagDao.getById(this.db, id)
    if (!current) throw new Error('标签不存在')

    let tag = current
    if (patch.name && patch.name.trim() !== current.name) {
      const name = patch.name.trim()
      const conflict = tagDao.getByName(this.db, name)
      if (conflict && conflict.id !== id) throw new Error(`标签「${name}」已存在`)
      tag = tagDao.rename(this.db, id, name)
    }

    const descriptions = { ...this.config.get().tagDescriptions }
    if (patch.description !== undefined) {
      if (patch.description) descriptions[tag.name] = patch.description
      else delete descriptions[tag.name]
      this.config.update({ tagDescriptions: descriptions })
    } else if (tag.name !== current.name && descriptions[current.name]) {
      descriptions[tag.name] = descriptions[current.name]
      delete descriptions[current.name]
      this.config.update({ tagDescriptions: descriptions })
    }

    return { ...tag, description: descriptions[tag.name] ?? null }
  }

  delete(id: number): void {
    if (!tagDao.getById(this.db, id)) throw new Error('标签不存在')
    tagDao.delete(this.db, id)
  }

  addHierarchy(req: AddHierarchyRequest): void {
    if (req.parentId === req.childId) throw new Error('标签不能成为自己的父级')
    if (!tagDao.getById(this.db, req.parentId) || !tagDao.getById(this.db, req.childId)) {
      throw new Error('标签不存在')
    }
    if (this.wouldCreateCycle(req.parentId, req.childId)) {
      throw new Error('该操作会形成循环引用，已阻止')
    }
    tagDao.addHierarchy(this.db, req.parentId, req.childId)
  }

  removeHierarchy(parentId: number, childId: number): void {
    tagDao.removeHierarchy(this.db, parentId, childId)
  }

  /**
   * BFS 防环：添加边 parent → child 前，检查 child 是否已经是 parent 的祖先。
   * 若是，则加入该边会形成环。
   */
  wouldCreateCycle(parentId: number, childId: number): boolean {
    if (parentId === childId) return true
    // 从 child 出发沿"父边"向上遍历，若到达 parentId 则成环
    const visited = new Set<number>()
    const queue: number[] = [childId]
    while (queue.length > 0) {
      const current = queue.shift() as number
      if (visited.has(current)) continue
      visited.add(current)
      if (current === parentId) return true
      for (const pid of tagDao.parentsOf(this.db, current)) {
        if (!visited.has(pid)) queue.push(pid)
      }
    }
    return false
  }
}
