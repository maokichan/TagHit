/**
 * 快捷键注册表（键位表机制）的断言。
 *
 * 键位表不是文档而是**注册表**（D23：快捷键 = 命令注册表的视图）——设置页那张表由它现取生成，
 * 所以这里守的是机制本身：组合键唯一、修饰键严格匹配、人类可读描述、输入态放行规则。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearShortcuts,
  describe as describeBinding,
  isEditableTarget,
  listShortcuts,
  matchShortcut,
  registerShortcut,
} from '../features/keyboardMouse/shortcuts'

function keyEvent(
  key: string,
  mods: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>> = {}
): KeyboardEvent {
  return {
    key,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
    shiftKey: mods.shiftKey ?? false,
    altKey: mods.altKey ?? false,
  } as KeyboardEvent
}

describe('快捷键注册表', () => {
  beforeEach(() => {
    clearShortcuts()
  })

  it('绑定可注册，并出现在键位表里（同一份数据喂设置页）', () => {
    expect(registerShortcut({ commandId: 'item.next', key: 'arrowright', label: '下一张' })).toBe(true)
    const rows = listShortcuts()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.commandId).toBe('item.next')
  })

  it('重复组合键被拒绝（冲突在开发期暴露，不静默覆盖）', () => {
    registerShortcut({ commandId: 'a', key: 'f', mod: true })
    expect(registerShortcut({ commandId: 'b', key: 'f', mod: true })).toBe(false)
    expect(listShortcuts()).toHaveLength(1)
  })

  it('修饰键严格匹配：多按一个修饰键就不命中', () => {
    registerShortcut({ commandId: 'item.next', key: 'arrowright' })
    expect(matchShortcut(keyEvent('ArrowRight'))?.commandId).toBe('item.next')
    expect(matchShortcut(keyEvent('ArrowRight', { shiftKey: true }))).toBeNull()
    expect(matchShortcut(keyEvent('ArrowRight', { ctrlKey: true }))).toBeNull()
    expect(matchShortcut(keyEvent('ArrowLeft'))).toBeNull()
  })

  it('Ctrl 与 Cmd 同义（跨平台同一语义）', () => {
    registerShortcut({ commandId: 'shell.focusSearch', key: 'f', mod: true })
    expect(matchShortcut(keyEvent('f', { ctrlKey: true }))?.commandId).toBe('shell.focusSearch')
    expect(matchShortcut(keyEvent('f', { metaKey: true }))?.commandId).toBe('shell.focusSearch')
    expect(matchShortcut(keyEvent('f'))).toBeNull()
  })

  it('组合键的人类可读描述（键位表的"组合键"列）', () => {
    expect(describeBinding({ commandId: 'x', key: 'f', mod: true })).toBe('Ctrl+F')
    expect(describeBinding({ commandId: 'x', key: 'arrowleft' })).toBe('arrowleft')
    expect(describeBinding({ commandId: 'x', key: 'f', mod: true, shift: true })).toBe('Ctrl+Shift+F')
  })

  it('输入态放行规则：输入框/文本域/可选框/可编辑元素算输入态', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
