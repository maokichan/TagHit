/**
 * 命令面板（调用面第三个视图）与节点类命令的注册表断言。
 *
 * 守的是两条本项目的纪律：
 * ① **面板是命令注册表的视图**——行 = 注册表条目，快捷键列来自绑定表，不另立清单；
 * ② **不静默失败**——命令的 when 在当前上下文求值不过时，面板如实标"当前不可用"（灰显不可执行），
 *    而不是让它执行成一个空操作。节点类命令的可用性（targetIs node）也在这里定桩：
 *    面板与右键菜单共用同一份谓词。
 */

import { afterEach, describe, expect, it } from 'vitest'
import { registerCommand, unregisterCommand, assembleMenu, getCommand, listCommands } from '../features/commands'
import { assemblePalette, buildPalette, matchCommand, paletteCandidates } from '../features/palette'
import type { MenuContext, MenuGroup, WhenClause } from '@shared/types/command'

const registered: string[] = []

function cmd(id: string, when?: WhenClause, group?: MenuGroup): void {
  registerCommand(
    { id, title: `${id} 标题`, source: 'official', when, menu: group ? { group } : undefined },
    () => {}
  )
  registered.push(id)
}

afterEach(() => {
  for (const id of registered.splice(0)) unregisterCommand(id)
})

const shellCtx: MenuContext = { target: { kind: 'shell' }, workspaceId: 'w1', selection: { ids: [] } }
const itemCtx: MenuContext = { target: { kind: 'item', id: 'i1' }, workspaceId: 'w1', selection: { ids: ['i1'] } }
const nodeCtx: MenuContext = { target: { kind: 'node', dirPath: 'D:/a/b' }, workspaceId: 'w1', selection: { ids: [] } }

describe('命令注册表（面板的取数面）', () => {
  it('listCommands 如实列出注册项（含无菜单项的命令——面板要列得出它们）', () => {
    cmd('shell.a', { kind: 'targetIs', value: 'shell' })
    cmd('item.b', { kind: 'targetIs', value: 'item' }, 'nav')
    expect(listCommands().map((e) => e.manifest.id).sort()).toEqual(['item.b', 'shell.a'])
  })

  it('右键菜单按 when 过滤（不适合当前目标的命令不出现在菜单里）', () => {
    cmd('item.b', { kind: 'targetIs', value: 'item' }, 'nav')
    cmd('shell.a', { kind: 'targetIs', value: 'shell' }, 'nav')
    const ids = assembleMenu(itemCtx).flatMap((s) => s.commands.map((c) => c.manifest.id))
    expect(ids).toEqual(['item.b'])
  })

  it('节点类命令只在 node 目标下进菜单（面板与菜单同一份谓词）', () => {
    cmd('node.hideSubtree', { kind: 'targetIs', value: 'node' }, 'modify')
    expect(assembleMenu(itemCtx)).toHaveLength(0)
    expect(assembleMenu(nodeCtx).flatMap((s) => s.commands.map((c) => c.manifest.id))).toEqual([
      'node.hideSubtree'
    ])
  })
})

describe('命令面板：候选上下文', () => {
  it('shell 上下文恒在（视图类命令总该能按）', () => {
    const cs = paletteCandidates({ workspaceId: 'w1', selectionIds: [], targetItemId: null })
    expect(cs.map((c) => c.target.kind)).toEqual(['shell'])
    expect(cs[0]?.workspaceId).toBe('w1')
  })

  it('有目标条目时补一条 item 上下文（批量与单条命令的归属）', () => {
    const cs = paletteCandidates({ workspaceId: 'w1', selectionIds: ['i1', 'i2'], targetItemId: 'i2' })
    expect(cs.map((c) => c.target.kind)).toEqual(['shell', 'item'])
    expect(cs[1]?.target.id).toBe('i2')
    expect(cs[1]?.selection?.ids).toEqual(['i1', 'i2'])
  })

  it('无单选但有选择集时用选择集首项作目标（不静默丢掉整集）', () => {
    const cs = paletteCandidates({ workspaceId: 'w1', selectionIds: ['i9'], targetItemId: null })
    expect(cs[1]?.target.id).toBe('i9')
    expect(cs[1]?.workspaceId).toBe('w1')
  })

  it('没有活动工作区时不补 item 上下文（条目类命令无解，不谎报可用）', () => {
    const cs = paletteCandidates({ workspaceId: null, selectionIds: ['i9'], targetItemId: 'i9' })
    expect(cs.map((c) => c.target.kind)).toEqual(['shell'])
  })
})

describe('命令面板：行组装', () => {
  it('when 求值不过的行保留但标为不可用（面板是注册表的视图，不隐藏注册过的命令）', () => {
    cmd('item.open', { kind: 'targetIs', value: 'item' }, 'nav')
    const rows = assemblePalette(listCommands(), [shellCtx], '', [])
    expect(rows.map((r) => [r.entry.manifest.id, r.applicable])).toEqual([['item.open', false]])
  })

  it('在候选上下文里任一成立即可用，并执行于那个上下文', () => {
    cmd('item.open', { kind: 'targetIs', value: 'item' }, 'nav')
    const rows = assemblePalette(listCommands(), [shellCtx, itemCtx], '', [])
    expect(rows[0]?.applicable).toBe(true)
    expect(rows[0]?.ctx.target.kind).toBe('item')
  })

  it('可用行在前；组序 导航 → 修改 → 危险；无菜单的命令沉底', () => {
    cmd('x.danger', { kind: 'targetIs', value: 'shell' }, 'danger')
    cmd('x.noMenu', { kind: 'targetIs', value: 'shell' })
    cmd('x.nav', { kind: 'targetIs', value: 'shell' }, 'nav')
    cmd('x.hidden', { kind: 'targetIs', value: 'item' }, 'nav')
    const rows = assemblePalette(listCommands(), [shellCtx], '', [])
    expect(rows.map((r) => r.entry.manifest.id)).toEqual(['x.nav', 'x.danger', 'x.noMenu', 'x.hidden'])
  })

  it('关键字过滤：标题或命令 id 的子串，大小写不敏感', () => {
    cmd('item.copyPath', { kind: 'targetIs', value: 'item' }, 'modify')
    const entry = getCommand('item.copyPath')!
    expect(matchCommand('copypath', entry)).toBe(true)
    expect(matchCommand('ITEM.COPY', entry)).toBe(true)
    expect(matchCommand('打开', entry)).toBe(false)
    expect(assemblePalette(listCommands(), [itemCtx], 'copypath', [])).toHaveLength(1)
  })

  it('已绑定的组合键随行显示（面板与键位表同一份绑定表）', () => {
    cmd('shell.focusSearch', { kind: 'targetIs', value: 'shell' })
    const rows = assemblePalette(listCommands(), [shellCtx], '', [
      { commandId: 'shell.focusSearch', key: 'f', mod: true }
    ])
    expect(rows[0]?.shortcut).toBe('Ctrl+F')
  })

  it('buildPalette 一行取齐：注册表 → 候选上下文 → 行（只出官方）', () => {
    cmd('node.onlyThis', { kind: 'targetIs', value: 'node' }, 'nav')
    const rows = buildPalette('', { workspaceId: 'w1', selectionIds: [], targetItemId: null })
    expect(rows.map((r) => [r.entry.manifest.id, r.applicable])).toEqual([['node.onlyThis', false]])
  })

  it('现场事实参与可用性：详情页翻页没挂详情页时标不可用（不静默空操作）', () => {
    cmd('item.next', {
      kind: 'all',
      clauses: [
        { kind: 'targetIs', value: 'shell' },
        { kind: 'fieldEquals', field: 'detailNav', value: true }
      ]
    })
    const base = { workspaceId: 'w1', selectionIds: [], targetItemId: null }
    expect(assemblePalette(listCommands(), paletteCandidates(base), '', [])[0]?.applicable).toBe(false)
    expect(
      assemblePalette(listCommands(), paletteCandidates({ ...base, detailNavActive: true }), '', [])[0]
        ?.applicable
    ).toBe(true)
  })
})
