/**
 * 窄桥门面（`shared/api.ts`）的边界断言。
 *
 * 两条都是**实机踩过的**（2026-10-01），每一条都曾让整个界面看起来像"功能没做/数据丢了"：
 * ① 桥对象是**只读且不可配置**的（contextBridge 的等价物）——用 Proxy 包装会违反不变式直接抛错；
 * ② 入参里的**响应式 Proxy**过不了 IPC 的结构化克隆——门面必须先把入参转成纯数据。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

/** 模拟 contextBridge 暴露的对象：属性只读且不可配置（Object.freeze 等价）。 */
function frozenBridge(calls: string[]) {
  const invoke = (name: string, ...args: unknown[]) => {
    structuredClone(args) // 模拟 ipcRenderer.invoke 的入参克隆：Proxy 会在这里抛 DataCloneError
    calls.push(name)
    return Promise.resolve({ ok: true, data: { name, argCount: args.length } })
  }
  return Object.freeze({
    listWorkspaces: () => invoke('workspace.list'),
    searchTags: (text: string) => invoke('tags.search', text),
    tagItems: (input: unknown) => invoke('items.tag', input),
    ping: () => invoke('ping'),
  })
}

describe('窄桥门面', () => {
  beforeEach(() => {
    vi.resetModules() // 门面里有缓存的桥包装，每个用例都要重来
  })

  it('桥是只读不可配置对象时不抛错（Proxy 包装会抛不变式 TypeError，正是实机症状）', async () => {
    const calls: string[] = []
    vi.stubGlobal('window', { taghit: frozenBridge(calls) })
    const { api } = await import('@shared/api')
    await expect(api.workspaces.list()).resolves.toEqual({ name: 'workspace.list', argCount: 0 })
    await api.tags.search('猫')
    expect(calls).toEqual(['workspace.list', 'tags.search'])
  })

  it('入参里的响应式 Proxy 会被纯化后再过桥（否则 IPC 抛 DataCloneError）', async () => {
    const calls: string[] = []
    vi.stubGlobal('window', { taghit: frozenBridge(calls) })
    const { api } = await import('@shared/api')
    const itemIds = reactive(['i1', 'i2'])
    const tagIds = reactive(['t1'])
    await api.items.tagMany(itemIds, tagIds)
    expect(calls).toEqual(['items.tag'])
  })

  it('宿主未就绪时给出明确错误（不是静默空数据）', async () => {
    vi.stubGlobal('window', {})
    const { api, ApiError } = await import('@shared/api')
    await expect(api.workspaces.list()).rejects.toBeInstanceOf(ApiError)
    await expect(api.workspaces.list()).rejects.toThrow(/宿主未就绪/)
  })
})
