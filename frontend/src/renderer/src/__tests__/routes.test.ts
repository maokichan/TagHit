/**
 * 顺序上下文与标签↔路由映射的断言（渲染层纯逻辑）。
 *
 * 这些断言守的是**行为**（不是数据）：路由带什么、上下文怎么解析、守卫怎么判命中。
 * 最后一条是实机 bug 的回归：**"按方向键跳到很奇怪的地方"**——
 * 热重载/旧会话里活下来的标签项没有 context 字段时，上下文绝不能退成"跨工作区全库"。
 */

import { describe, expect, it } from 'vitest'
import {
  itemContextFromQuery,
  itemRoute,
  resolveItemContext,
  routeMatchesTab,
  routeOfTab,
} from '../features/routes'
import type { ItemContext } from '@shared/contract'
import type { ItemTab, WorkspaceTabItem } from '../stores/tab'

const CTX: ItemContext = {
  workspaceId: 'ws-1',
  order: 'createdAt',
  orderDir: 'desc',
  withAllTags: ['t1', 't2'],
  titleContains: '猫 图',
  underDirPath: 'D:/库/子 目录',
}

/** 旧会话/热重载残留的标签项：有 workspaceId，但**没有** context 字段。 */
const staleTab = {
  key: 'item:i1',
  kind: 'item',
  itemId: 'i1',
  workspaceId: 'ws-9',
  title: '旧标签项',
} as unknown as ItemTab

const freshTab = {
  key: 'item:i2',
  kind: 'item',
  itemId: 'i2',
  workspaceId: 'ws-1',
  title: '新标签项',
  context: CTX,
} as ItemTab

describe('条目详情的顺序上下文', () => {
  it('上下文随路由往返：写进去的必须原样读回来（含中文/空格/多标签/范围）', () => {
    const route = itemRoute('item-1', CTX)
    expect(route.startsWith('/item/item-1?')).toBe(true)
    const query = Object.fromEntries(new URLSearchParams(route.split('?')[1] ?? ''))
    expect(itemContextFromQuery(query)).toEqual(CTX)
  })

  it('没有顺序上下文的新条目（无视图条件）也能生成合法路由', () => {
    const route = itemRoute('item-2', { order: 'createdAt', orderDir: 'asc' })
    expect(route).toBe('/item/item-2?order=createdAt&dir=asc')
  })

  it('标签项带 context：以标签项为准（路由 query 只作携带形态）', () => {
    expect(resolveItemContext(freshTab, { workspace: 'ws-OTHER', dir: 'asc' })).toEqual(CTX)
  })

  it('标签项没有 context（热重载残留）：路由 query 优先', () => {
    expect(resolveItemContext(staleTab, { workspace: 'ws-7', order: 'title', dir: 'asc' })).toEqual({
      workspaceId: 'ws-7',
      order: 'title',
      orderDir: 'asc',
    })
  })

  it('标签项没有 context 且路由没带工作区：补上标签项自己的工作区——**不得退成跨工作区全库**', () => {
    expect(resolveItemContext(staleTab, {}).workspaceId).toBe('ws-9')
    expect(resolveItemContext(staleTab, {}).workspaceId).not.toBeNull()
  })

  it('确实没有工作区上下文时（全局搜索）才允许 null', () => {
    expect(resolveItemContext(null, {}).workspaceId).toBeNull()
    expect(resolveItemContext(null, { q: '关键词' })).toEqual({
      workspaceId: null,
      order: 'createdAt',
      orderDir: 'desc',
      titleContains: '关键词',
    })
  })
})

describe('标签 ↔ 路由', () => {
  it('条目标签的路由携带它固化的顺序上下文', () => {
    expect(routeOfTab(freshTab)).toBe(itemRoute('i2', CTX))
  })

  it('路由命中判定：条目详情只比路径，查询串（上下文元数据）不参与', () => {
    expect(routeMatchesTab(freshTab, itemRoute('i2', CTX))).toBe(true)
    expect(routeMatchesTab(freshTab, '/item/i2')).toBe(true) // 查询串丢了也仍命中
    expect(routeMatchesTab(freshTab, '/item/i2?order=title&dir=asc')).toBe(true) // 编码差异不算"另一个地方"
    expect(routeMatchesTab(freshTab, '/item/OTHER')).toBe(false)
  })

  it('非条目标签整串比较（没有查询串语义）', () => {
    const ws = { key: 'ws:1', kind: 'workspace', workspaceId: 'ws-1', title: '工作区' } as WorkspaceTabItem
    expect(routeMatchesTab(ws, '/workspace/ws-1')).toBe(true)
    expect(routeMatchesTab(ws, '/workspace/ws-1?x=1')).toBe(false)
  })
})
