/**
 * 渲染层 ↔ 主进程的 IPC 契约：类型化的窄桥。
 *
 * 设计要点：
 * - 每个端点 = 一个应用层用例/读操作的窄封装，参数与结果全部类型化；
 * - 统一结果信封 Result<T>：成功 { ok:true, data } / 失败 { ok:false, error:{code,message} }
 *   ——D9 错误转译在此落地：DomainError.code 原样带出，渲染层只按 code 转文案；
 * - 渲染层**不直接触碰 Store**：所有读写都经这里路由到应用层用例，
 *   字节/文件/数据库永不进入渲染层。
 */

import type { DomainErrorCode, Id, Tag } from '../domain/index.ts'
import type { ItemHit, ItemsQuery } from '../ports/index.ts'

export interface Ok<T> {
  ok: true
  data: T
}

export interface Err {
  ok: false
  error: { code: DomainErrorCode | 'UNKNOWN'; message: string }
}

export type Result<T> = Ok<T> | Err

/** 端点契约：args → result。新增端点在此加一行即获得两端类型。 */
export interface IpcContracts {
  ping: { args: []; result: { version: string } }
  'tags.search': { args: [text: string]; result: Tag[] }
  'items.query': { args: [query: ItemsQuery]; result: ItemHit[] }
  'item.tag': { args: [{ itemId: Id; tagIds: Id[] }]; result: null }
  'item.untag': { args: [{ itemId: Id; tagIds: Id[] }]; result: null }
}

export type IpcKind = keyof IpcContracts

export type IpcArgs<K extends IpcKind> = IpcContracts[K]['args']
export type IpcResult<K extends IpcKind> = Result<IpcContracts[K]['result']>

/** 渲染层通过 window.taghit 获得的面（preload 实现）。 */
export interface TaghitRendererApi {
  ping(): Promise<IpcResult<'ping'>>
  searchTags(text: string): Promise<IpcResult<'tags.search'>>
  queryItems(query: ItemsQuery): Promise<IpcResult<'items.query'>>
  tagItem(input: { itemId: Id; tagIds: Id[] }): Promise<IpcResult<'item.tag'>>
  untagItem(input: { itemId: Id; tagIds: Id[] }): Promise<IpcResult<'item.untag'>>
}
