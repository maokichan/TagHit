/**
 * preload：contextIsolation 下把窄桥暴露为 window.taghit。
 * 只转发 IPC 契约里的端点，不暴露 ipcRenderer 本体。
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { IpcArgs, IpcContracts, IpcKind, IpcResult, TaghitRendererApi } from './ipc.ts'

function invoke<K extends IpcKind>(
  kind: K,
  ...args: IpcArgs<K>
): Promise<IpcResult<K>> {
  return ipcRenderer.invoke(kind, ...args) as Promise<IpcResult<K>>
}

const api: TaghitRendererApi = {
  ping: () => invoke('ping'),
  searchTags: (text) => invoke('tags.search', text),
  queryItems: (query) => invoke('items.query', query),
  tagItem: (input) => invoke('item.tag', input),
  untagItem: (input) => invoke('item.untag', input),
}

contextBridge.exposeInMainWorld('taghit', api)

export type { IpcContracts }
