/**
 * Electron 主进程：宿主的装配点（唯一允许接触 node:sqlite / node:fs / electron 的地方）。
 *
 * 职责：
 * - 组装 AppServices：SqliteStore（真实库文件）+ 真时钟 + UUID；
 * - 用「用例窄桥」注册 IPC 端点（契约见 ipc.ts），统一结果信封与 D9 错误转译；
 * - 创建隔离窗口（contextIsolation，渲染层无 Node；preload 仅暴露 window.taghit）。
 *
 * 开发态：TAGHIT_RENDERER_URL（缺省 http://localhost:5173）指向渲染 dev server；
 * 打包态改 loadFile 本地产物。真实 node:fs 由扫描端点按需注入（NodeFileSystem 已就绪）。
 */

import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, ipcMain } from 'electron'
import { DomainError } from '../domain/index.ts'
import { createSqliteStore } from '../adapters/sqlite/index.ts'
import { createNodeFileSystem } from '../adapters/node/index.ts'
import {
  appendCollectionMember,
  browseWorkspace,
  createCollection,
  createGroup,
  createTag,
  createWorkspace,
  declareTag,
  declaredTagIds,
  deleteCollectionCascade,
  deleteGroupCascade,
  deleteItemCascade,
  deleteTagCascade,
  deleteWorkspaceCascade,
  addGroupMember,
  getWorkspace,
  listWorkspaceRoots,
  listWorkspaces,
  mountWorkspaceRoot,
  removeCollectionMember,
  removeGroupMember,
  renameCollection,
  renameGroup,
  reorderCollectionMembers,
  scanWorkspace,
  searchTags,
  tagItem,
  undeclareTag,
  unmountWorkspaceRoot,
  untagItem,
} from '../application/index.ts'
import type { AppServices, ScanOptions } from '../application/index.ts'
import type { Id } from '../domain/index.ts'
import type { ItemsQuery } from '../ports/index.ts'
import type { DomainErrorCode } from '../domain/index.ts'

function dbPath(): string {
  return process.env.TAGHIT_DB ?? `${app.getPath('userData')}/taghit.db`
}

const services: AppServices = {
  store: createSqliteStore(dbPath()),
  clock: { now: () => new Date().toISOString() },
  idGen: { newId: () => randomUUID() },
}

function toErrorCode(error: unknown): { code: DomainErrorCode | 'UNKNOWN'; message: string } {
  if (error instanceof DomainError) return { code: error.code, message: error.message }
  return { code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) }
}

/** 统一信封：成功 { ok:true, data } / 失败 { ok:false, error }（D9）。 */
async function envelope<T>(work: Promise<T>): Promise<{ ok: boolean; data?: T; error?: { code: string; message: string } }> {
  try {
    return { ok: true, data: await work }
  } catch (error) {
    return { ok: false, error: toErrorCode(error) }
  }
}

/** 真实文件系统：仅主进程持有，扫描端点按需使用。 */
const nodeFs = createNodeFileSystem()

function registerHandlers(): void {
  ipcMain.handle('ping', () => envelope(Promise.resolve({ version: '0.2.3' })))

  // ---- 标签 ----
  ipcMain.handle('tags.search', (_event, text: string) => envelope(searchTags(services, text)))
  ipcMain.handle('tags.create', (_event, input: { name: string; description?: string | null }) =>
    envelope(createTag(services, input))
  )
  ipcMain.handle('tags.delete', (_event, tagId: Id) =>
    envelope(deleteTagCascade(services, tagId).then(() => null))
  )
  ipcMain.handle('tags.declare', (_event, input: { workspaceId: Id; tagId: Id }) =>
    envelope(declareTag(services, input.workspaceId, input.tagId).then(() => null))
  )
  ipcMain.handle('tags.undeclare', (_event, input: { workspaceId: Id; tagId: Id }) =>
    envelope(undeclareTag(services, input.workspaceId, input.tagId).then(() => null))
  )

  // ---- 条目 ----
  ipcMain.handle('items.query', (_event, query: ItemsQuery) =>
    envelope(services.store.queryItems(query))
  )
  ipcMain.handle('item.tag', (_event, input: { itemId: Id; tagIds: Id[] }) =>
    envelope(tagItem(services, input.itemId, input.tagIds).then(() => null))
  )
  ipcMain.handle('item.untag', (_event, input: { itemId: Id; tagIds: Id[] }) =>
    envelope(untagItem(services, input.itemId, input.tagIds).then(() => null))
  )
  ipcMain.handle('items.delete', (_event, itemId: Id) =>
    envelope(deleteItemCascade(services, itemId).then(() => null))
  )

  // ---- 工作区 ----
  ipcMain.handle('workspace.create', (_event, name: string) => envelope(createWorkspace(services, name)))
  ipcMain.handle('workspace.list', () => envelope(listWorkspaces(services)))
  ipcMain.handle('workspace.get', (_event, workspaceId: Id) => envelope(getWorkspace(services, workspaceId)))
  ipcMain.handle('workspace.browse', (_event, workspaceId: Id, query?: ItemsQuery) =>
    envelope(browseWorkspace(services, workspaceId, query))
  )
  ipcMain.handle('workspace.declaredTags', (_event, workspaceId: Id) =>
    envelope(declaredTagIds(services, workspaceId))
  )
  ipcMain.handle('workspace.mountRoot', (_event, input: { workspaceId: Id; path: string }) =>
    envelope(mountWorkspaceRoot(services, input.workspaceId, input.path).then(() => null))
  )
  ipcMain.handle('workspace.unmountRoot', (_event, input: { workspaceId: Id; path: string }) =>
    envelope(unmountWorkspaceRoot(services, input.workspaceId, input.path).then(() => null))
  )
  ipcMain.handle('workspace.listRoots', (_event, workspaceId: Id) =>
    envelope(listWorkspaceRoots(services, workspaceId))
  )
  ipcMain.handle('workspace.delete', (_event, workspaceId: Id) =>
    envelope(deleteWorkspaceCascade(services, workspaceId).then(() => null))
  )

  // ---- 扫描（真实文件系统在此注入，渲染层拿不到 fs） ----
  ipcMain.handle('scan.run', (_event, workspaceId: Id, options?: ScanOptions) =>
    envelope(scanWorkspace(services, nodeFs, workspaceId, options))
  )

  // ---- 作品 ----
  ipcMain.handle('collection.create', (_event, name: string) => envelope(createCollection(services, name)))
  ipcMain.handle('collection.rename', (_event, input: { collectionId: Id; name: string }) =>
    envelope(renameCollection(services, input.collectionId, input.name).then(() => null))
  )
  ipcMain.handle('collection.appendMember', (_event, input: { collectionId: Id; itemId: Id }) =>
    envelope(appendCollectionMember(services, input.collectionId, input.itemId).then(() => null))
  )
  ipcMain.handle('collection.removeMember', (_event, input: { collectionId: Id; itemId: Id }) =>
    envelope(removeCollectionMember(services, input.collectionId, input.itemId).then(() => null))
  )
  ipcMain.handle('collection.reorderMembers', (_event, input: { collectionId: Id; orderedItemIds: Id[] }) =>
    envelope(reorderCollectionMembers(services, input.collectionId, input.orderedItemIds).then(() => null))
  )
  ipcMain.handle('collection.delete', (_event, collectionId: Id) =>
    envelope(deleteCollectionCascade(services, collectionId).then(() => null))
  )

  // ---- 组 ----
  ipcMain.handle('group.create', (_event, name: string) => envelope(createGroup(services, name)))
  ipcMain.handle('group.rename', (_event, input: { groupId: Id; name: string }) =>
    envelope(renameGroup(services, input.groupId, input.name).then(() => null))
  )
  ipcMain.handle('group.addMember', (_event, input: { groupId: Id; tagId: Id }) =>
    envelope(addGroupMember(services, input.groupId, input.tagId).then(() => null))
  )
  ipcMain.handle('group.removeMember', (_event, input: { groupId: Id; tagId: Id }) =>
    envelope(removeGroupMember(services, input.groupId, input.tagId).then(() => null))
  )
  ipcMain.handle('group.delete', (_event, groupId: Id) =>
    envelope(deleteGroupCascade(services, groupId).then(() => null))
  )
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: `${app.getAppPath()}/src/host/preload.ts`,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  void win.loadURL(process.env.TAGHIT_RENDERER_URL ?? 'http://localhost:5173')
}

registerHandlers()

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => createWindow())
})

app.on('window-all-closed', () => app.quit())
