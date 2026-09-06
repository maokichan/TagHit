import { contextBridge, ipcRenderer } from 'electron'
import { EVENT_CHANNELS, IPC } from '@shared/ipc'
import type { TaghitApi } from '@shared/api'
import type { EventChannel } from '@shared/ipc'

const api: TaghitApi = {
  workspace: {
    list: () => ipcRenderer.invoke(IPC.workspace.list),
    create: (title) => ipcRenderer.invoke(IPC.workspace.create, { title }),
    update: (id, title) => ipcRenderer.invoke(IPC.workspace.update, { id, title }),
    remove: (id) => ipcRenderer.invoke(IPC.workspace.remove, { id }),
    addPath: (req) => ipcRenderer.invoke(IPC.workspace.addPath, req),
    removePath: (pathId, workspaceId) =>
      ipcRenderer.invoke(IPC.workspace.removePath, { pathId, workspaceId }),
    scan: (req) => ipcRenderer.invoke(IPC.workspace.scan, req),
    setCover: (id, coverPath) => ipcRenderer.invoke(IPC.workspace.setCover, { id, coverPath })
  },
  item: {
    list: (filter) => ipcRenderer.invoke(IPC.item.list, filter),
    get: (id, workspaceId) => ipcRenderer.invoke(IPC.item.get, { id, workspaceId }),
    updateTags: (req) => ipcRenderer.invoke(IPC.item.updateTags, req),
    readText: (itemId) => ipcRenderer.invoke(IPC.item.readText, { itemId }),
    openWithSystem: (itemId) => ipcRenderer.invoke(IPC.item.openWithSystem, { itemId }),
    listSortKeys: () => ipcRenderer.invoke(IPC.item.listSortKeys)
  },
  tag: {
    list: () => ipcRenderer.invoke(IPC.tag.list),
    listWithRelations: () => ipcRenderer.invoke(IPC.tag.listWithRelations),
    listForWorkspace: (workspaceId) =>
      ipcRenderer.invoke(IPC.tag.listForWorkspace, { workspaceId }),
    create: (req) => ipcRenderer.invoke(IPC.tag.create, req),
    update: (id, patch) => ipcRenderer.invoke(IPC.tag.update, { id, ...patch }),
    remove: (id) => ipcRenderer.invoke(IPC.tag.remove, { id }),
    addHierarchy: (req) => ipcRenderer.invoke(IPC.tag.addHierarchy, req),
    removeHierarchy: (parentId, childId) =>
      ipcRenderer.invoke(IPC.tag.removeHierarchy, { parentId, childId }),
    declare: (req) => ipcRenderer.invoke(IPC.tag.declare, req),
    undeclare: (req) => ipcRenderer.invoke(IPC.tag.undeclare, req)
  },
  search: {
    query: (req) => ipcRenderer.invoke(IPC.search.query, req),
    global: (req) => ipcRenderer.invoke(IPC.search.global, req)
  },
  config: {
    get: () => ipcRenderer.invoke(IPC.config.get),
    update: (patch) => ipcRenderer.invoke(IPC.config.update, patch)
  },
  plugin: {
    list: () => ipcRenderer.invoke(IPC.plugin.list),
    call: (req) => ipcRenderer.invoke(IPC.plugin.call, req)
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke(IPC.dialog.pickFolder),
    pickImage: () => ipcRenderer.invoke(IPC.dialog.pickImage),
    confirm: (options) => ipcRenderer.invoke(IPC.dialog.confirm, options)
  },
  thumbnail: {
    save: (req) => ipcRenderer.invoke(IPC.thumbnail.save, req)
  },
  on: (channel: EventChannel, cb: (payload: unknown) => void) => {
    if (!EVENT_CHANNELS.includes(channel)) {
      console.warn(`[preload] 非法事件通道: ${channel}`)
      return () => undefined
    }
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type { TaghitApi }
