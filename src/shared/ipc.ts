/**
 * IPC 通道常量表 —— main / preload / renderer 三端共享的唯一事实来源。
 * 所有 ipcMain.handle / ipcRenderer.invoke / webContents.send 的通道名都必须来自这里。
 */

export const IPC = {
  workspace: {
    list: 'workspace:list',
    create: 'workspace:create',
    update: 'workspace:update',
    remove: 'workspace:remove',
    addPath: 'workspace:addPath',
    removePath: 'workspace:removePath',
    scan: 'workspace:scan',
    setCover: 'workspace:setCover'
  },
  item: {
    list: 'item:list',
    get: 'item:get',
    updateTags: 'item:updateTags',
    readText: 'item:readText',
    openWithSystem: 'item:openWithSystem',
    listSortKeys: 'item:listSortKeys'
  },
  tag: {
    list: 'tag:list',
    listWithRelations: 'tag:listWithRelations',
    listForWorkspace: 'tag:listForWorkspace',
    create: 'tag:create',
    update: 'tag:update',
    remove: 'tag:remove',
    addHierarchy: 'tag:addHierarchy',
    removeHierarchy: 'tag:removeHierarchy',
    declare: 'tag:declare',
    undeclare: 'tag:undeclare'
  },
  search: {
    query: 'search:query',
    global: 'search:global'
  },
  config: {
    get: 'config:get',
    update: 'config:update'
  },
  plugin: {
    list: 'plugin:list',
    call: 'plugin:call'
  },
  dialog: {
    pickFolder: 'dialog:pickFolder',
    pickImage: 'dialog:pickImage',
    confirm: 'dialog:confirm'
  },
  thumbnail: {
    save: 'thumbnail:save'
  },
  event: {
    scanProgress: 'event:scanProgress',
    scanCompleted: 'event:scanCompleted',
    plugin: 'event:plugin'
  }
} as const

/** 主进程 → 渲染进程的事件通道集合 */
export const EVENT_CHANNELS = [
  IPC.event.scanProgress,
  IPC.event.scanCompleted,
  IPC.event.plugin
] as const

export type EventChannel = (typeof EVENT_CHANNELS)[number]
