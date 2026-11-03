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
  updateTag: (tagId, patch) => invoke('tags.update', tagId, patch),
  getTagProfile: (tagId) => invoke('tags.getProfile', tagId),
  setTagProfile: (tagId, profile) => invoke('tags.setProfile', tagId, profile),
  tagStats: () => invoke('tags.stats'),
  tagPairStats: (q) => invoke('tags.pairStats', q),

  queryItems: (query) => invoke('items.query', query),
  itemWindow: (input) => invoke('item.window', input),
  tagItem: (input) => invoke('item.tag', input),
  untagItem: (input) => invoke('item.untag', input),
  tagItems: (input) => invoke('items.tag', input),
  untagItems: (input) => invoke('items.untag', input),
  deleteItem: (itemId) => invoke('items.delete', itemId),
  readText: (itemId, maxBytes) => invoke('item.readText', itemId, maxBytes),
  readAudioMeta: (itemId) => invoke('item.readAudioMeta', itemId),

  saveThumbnail: (input) => invoke('thumbnail.save', input),

  listNodes: (workspaceId) => invoke('nodes.list', workspaceId),
  setNodeState: (input) => invoke('node.setState', input),
  setSubtreeState: (input) => invoke('node.setSubtreeState', input),

  moveFsEntry: (input) => invoke('fs.move', input),
  trashFsEntry: (input) => invoke('fs.trash', input),

  pickDirectory: () => invoke('dialog.pickDirectory'),
  pickZip: () => invoke('dialog.pickZip'),

  listPlugins: () => invoke('plugins.list'),
  installPlugin: (zipPath) => invoke('plugins.install', zipPath),
  uninstallPlugin: (id) => invoke('plugins.uninstall', id),

  createWorkspace: (name) => invoke('workspace.create', name),
  listWorkspaces: () => invoke('workspace.list'),
  getWorkspace: (workspaceId) => invoke('workspace.get', workspaceId),
  browseWorkspace: (workspaceId, query) => invoke('workspace.browse', workspaceId, query),
  workspaceVisibility: (workspaceId) => invoke('workspace.visibility', workspaceId),
  declaredTags: (workspaceId) => invoke('workspace.declaredTags', workspaceId),
  mountRoot: (input) => invoke('workspace.mountRoot', input),
  unmountRoot: (input) => invoke('workspace.unmountRoot', input),
  listRoots: (workspaceId) => invoke('workspace.listRoots', workspaceId),
  workspaceRootManagement: (workspaceId) => invoke('workspace.rootManagement', workspaceId),
  cleanupDetachedItems: (input) => invoke('workspace.cleanupDetached', input),
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
  listGroups: () => invoke('group.list'),
  listGroupMemberships: () => invoke('group.members'),

  windowControl: (action) => invoke('window.control', action),
  isWindowMaximized: () => invoke('window.isMaximized'),

  // 单向端点：原生拖出必须在 dragstart 手势内发起，不能等 invoke 往返（见 IpcSendContracts）
  startDrag: (input) => ipcRenderer.send('drag.start', input),
}

contextBridge.exposeInMainWorld('taghit', api)

export type { IpcContracts }
