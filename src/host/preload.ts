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

  createTag: (input) => invoke('tags.create', input),
  searchTags: (text) => invoke('tags.search', text),
  deleteTag: (tagId) => invoke('tags.delete', tagId),
  declareTag: (input) => invoke('tags.declare', input),
  undeclareTag: (input) => invoke('tags.undeclare', input),

  queryItems: (query) => invoke('items.query', query),
  tagItem: (input) => invoke('item.tag', input),
  untagItem: (input) => invoke('item.untag', input),
  tagItems: (input) => invoke('items.tag', input),
  untagItems: (input) => invoke('items.untag', input),
  deleteItem: (itemId) => invoke('items.delete', itemId),
  readText: (itemId, maxBytes) => invoke('item.readText', itemId, maxBytes),

  saveThumbnail: (input) => invoke('thumbnail.save', input),

  listNodes: (workspaceId) => invoke('nodes.list', workspaceId),
  setNodeState: (input) => invoke('node.setState', input),
  setSubtreeState: (input) => invoke('node.setSubtreeState', input),

  moveFsEntry: (input) => invoke('fs.move', input),
  trashFsEntry: (input) => invoke('fs.trash', input),

  pickDirectory: () => invoke('dialog.pickDirectory'),

  createWorkspace: (name) => invoke('workspace.create', name),
  listWorkspaces: () => invoke('workspace.list'),
  getWorkspace: (workspaceId) => invoke('workspace.get', workspaceId),
  browseWorkspace: (workspaceId, query) => invoke('workspace.browse', workspaceId, query),
  declaredTags: (workspaceId) => invoke('workspace.declaredTags', workspaceId),
  mountRoot: (input) => invoke('workspace.mountRoot', input),
  unmountRoot: (input) => invoke('workspace.unmountRoot', input),
  listRoots: (workspaceId) => invoke('workspace.listRoots', workspaceId),
  deleteWorkspace: (workspaceId) => invoke('workspace.delete', workspaceId),

  runScan: (workspaceId, options) => invoke('scan.run', workspaceId, options),

  createCollection: (name) => invoke('collection.create', name),
  renameCollection: (input) => invoke('collection.rename', input),
  appendCollectionMember: (input) => invoke('collection.appendMember', input),
  removeCollectionMember: (input) => invoke('collection.removeMember', input),
  reorderCollectionMembers: (input) => invoke('collection.reorderMembers', input),
  deleteCollection: (collectionId) => invoke('collection.delete', collectionId),

  createGroup: (name) => invoke('group.create', name),
  renameGroup: (input) => invoke('group.rename', input),
  addGroupMember: (input) => invoke('group.addMember', input),
  removeGroupMember: (input) => invoke('group.removeMember', input),
  deleteGroup: (groupId) => invoke('group.delete', groupId),

  windowControl: (action) => invoke('window.control', action),
  isWindowMaximized: () => invoke('window.isMaximized'),
}

contextBridge.exposeInMainWorld('taghit', api)

export type { IpcContracts }
