/**
 * 标签页循环切换的断言（stores/tab.cycleActive，Ctrl+Tab / Ctrl+Shift+Tab 的实现）。
 * 守两条：单标签无事可做（返回 null）；沿标签栏顺序循环且反向可绕回——活动键始终指向存在标签。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTabStore } from '../stores/tab'

describe('标签页循环切换（tab.cycleActive）', () => {
  let store: ReturnType<typeof useTabStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useTabStore()
  })

  it('单标签无事可做（返回 null，活动键不动）', () => {
    store.ensureHome()
    const before = store.activeKey
    expect(store.cycleActive(1)).toBeNull()
    expect(store.cycleActive(-1)).toBeNull()
    expect(store.activeKey).toBe(before)
  })

  it('沿标签栏顺序循环，正向绕回、反向可绕回', () => {
    store.ensureHome() // [home]
    store.openFeature('tags', '标签') // [home, feature:tags]
    store.openSettings() // [home, feature:tags, settings]
    store.setActive(store.tabs[0].key) // home

    expect(store.cycleActive(1)?.key).toBe('feature:tags')
    expect(store.cycleActive(1)?.key).toBe('settings')
    expect(store.cycleActive(1)?.key).toBe(store.tabs[0].key) // 绕回 home
    expect(store.cycleActive(-1)?.key).toBe('settings') // 反向绕回
  })
})
