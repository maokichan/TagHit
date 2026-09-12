/**
 * Electron 主进程：宿主的装配点（唯一允许接触 SQLite 驱动 / node:fs / electron 的地方）。
 *
 * 职责：
 * - 组装 AppServices：SqliteStore（better-sqlite3 真实库文件）+ 真时钟 + UUID；
 * - 用「用例窄桥」注册 IPC 端点（契约见 ipc.ts），统一结果信封与 D9 错误转译；
 * - 创建隔离窗口（contextIsolation，渲染层无 Node；preload 仅暴露 window.taghit）。
 *
 * 开发态：TAGHIT_RENDERER_URL（缺省 http://localhost:5173）指向渲染 dev server；
 * 打包态改 loadFile 本地产物。真实 node:fs 由扫描端点按需注入（NodeFileSystem 已就绪）。
 */

import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { DomainError } from '../domain/index.ts'
import { createSqliteStoreFromDriver } from '../adapters/sqlite/store.ts'
import { createNodeFileSystem } from '../adapters/node/index.ts'
import { openSqlite } from './sqliteDriver.ts'
import { registerPrivilegedSchemes, registerTaghitFileProtocol } from './protocol.ts'
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
  listWorkspaceNodes,
  listWorkspaceRoots,
  listWorkspaces,
  mountWorkspaceRoot,
  moveFsEntry,
  readItemText,
  recordThumbnail,
  removeCollectionMember,
  removeGroupMember,
  renameCollection,
  renameGroup,
  reorderCollectionMembers,
  scanWorkspace,
  searchTags,
  setNodeState,
  setSubtreeState,
  tagItem,
  tagItems,
  trashFsEntry,
  undeclareTag,
  unmountWorkspaceRoot,
  untagItem,
  untagItems,
  queryItems,
} from '../application/index.ts'
import type { AppServices, ScanOptions } from '../application/index.ts'
import type { Id } from '../domain/index.ts'
import type { ItemsQuery } from '../ports/index.ts'
import type { DomainErrorCode } from '../domain/index.ts'

function dbPath(): string {
  return process.env.TAGHIT_DB ?? `${app.getPath('userData')}/taghit.db`
}

// 开发态 userData 按库文件隔离：两个实例共用 userData 时 GPU/磁盘缓存锁冲突
// （cache_util_win 拒绝访问 0x5），后启动者渲染层直接黑屏。按 TAGHIT_DB 派生
// 目录键，不同库的多实例互不争锁；缩略图目录随实例走，与库内 previewUri 自洽。
if (process.env.TAGHIT_RENDERER_URL != null) {
  const key = createHash('sha1').update(dbPath()).digest('hex').slice(0, 8)
  app.setPath('userData', `${app.getPath('userData')}-dev-${key}`)
}

// 单实例锁（按 userData = 按库）：同库双开必撞缓存锁 → 后者干净退出并提示，
// 而不是黑屏；不同库实例各自持锁，互不影响。
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  console.error('[host] 已有同库实例在运行：退出本次启动（关掉旧窗口或换 TAGHIT_DB 再开）')
  app.quit()
}

/** 版本单一事实源 = package.json（ping 端点用；字面量会随迭代过期）。 */
const HOST_VERSION: string = JSON.parse(readFileSync(`${app.getAppPath()}/package.json`, 'utf8')).version

const services: AppServices = {
  store: createSqliteStoreFromDriver(openSqlite(dbPath())),
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
  ipcMain.handle('ping', () => envelope(Promise.resolve({ version: HOST_VERSION })))

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
    envelope(queryItems(services, query))
  )
  ipcMain.handle('item.tag', (_event, input: { itemId: Id; tagIds: Id[] }) =>
    envelope(tagItem(services, input.itemId, input.tagIds).then(() => null))
  )
  ipcMain.handle('item.untag', (_event, input: { itemId: Id; tagIds: Id[] }) =>
    envelope(untagItem(services, input.itemId, input.tagIds).then(() => null))
  )
  ipcMain.handle('items.tag', (_event, input: { itemIds: Id[]; tagIds: Id[] }) =>
    envelope(tagItems(services, input.itemIds, input.tagIds).then(() => null))
  )
  ipcMain.handle('items.untag', (_event, input: { itemIds: Id[]; tagIds: Id[] }) =>
    envelope(untagItems(services, input.itemIds, input.tagIds).then(() => null))
  )
  ipcMain.handle('items.delete', (_event, itemId: Id) =>
    envelope(deleteItemCascade(services, itemId).then(() => null))
  )
  ipcMain.handle('item.readText', (_event, itemId: Id, maxBytes?: number) =>
    envelope(readItemText(services, nodeFs, itemId, maxBytes))
  )

  // ---- 缩略图：base64 落盘 {userData}/thumbnails/{contentHash}.jpg + 按哈希回写 ----
  // 写入键 = contentHash（路径注入不可达）；base64 超 2MiB 拒绝（INVALID）。
  ipcMain.handle(
    'thumbnail.save',
    (_event, input: { contentHash: string; base64: string; width?: number | null; height?: number | null }) => {
      const buf = Buffer.from(input.base64, 'base64')
      if (buf.byteLength > 2 * 1024 * 1024) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'INVALID' as const, message: '缩略图数据超过 2MiB 上限' },
        })
      }
      const dir = join(app.getPath('userData'), 'thumbnails')
      mkdirSync(dir, { recursive: true })
      const previewUri = join(dir, `${input.contentHash}.jpg`)
      writeFileSync(previewUri, buf)
      return envelope(
        recordThumbnail(services, {
          contentHash: input.contentHash,
          previewUri,
          width: input.width,
          height: input.height,
        }).then(() => ({ previewUri }))
      )
    }
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

  // ---- 路径节点（来源根树）----
  ipcMain.handle('nodes.list', (_event, workspaceId: Id) =>
    envelope(listWorkspaceNodes(services, workspaceId))
  )
  ipcMain.handle('node.setState', (_event, input: { workspaceId: Id; dirPath: string; state: 'included' | 'excluded' }) =>
    envelope(setNodeState(services, input.workspaceId, input.dirPath, input.state).then(() => null))
  )
  ipcMain.handle('node.setSubtreeState', (_event, input: { workspaceId: Id; dirPath: string; state: 'included' | 'excluded' }) =>
    envelope(setSubtreeState(services, input.workspaceId, input.dirPath, input.state).then(() => null))
  )

  // ---- 文件操作（真实文件增删改；回收站经 shell，路径闸门在用例内） ----
  ipcMain.handle('fs.move', (_event, input: { workspaceId: Id; from: string; toDir: string; newName?: string | null }) =>
    envelope(moveFsEntry(services, nodeFs, input.workspaceId, input.from, input.toDir, input.newName))
  )
  ipcMain.handle(
    'fs.trash',
    (_event, input: { workspaceId: Id; path: string }) =>
      envelope(trashFsEntry(services, nodeFs, { trash: (p) => shell.trashItem(p) }, input.workspaceId, input.path).then(() => null))
  )

  // ---- 对话框（原生目录选择；取消 → null） ----
  ipcMain.handle('dialog.pickDirectory', (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (win == null) return envelope(Promise.resolve(null))
    return envelope(dialog.showOpenDialog(win, { properties: ['openDirectory'] }).then((r) =>
      r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
    ))
  })

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

  // ---- 窗口（壳级：无边框窗口的自绘控制键，直接操作发起方所在窗口） ----
  ipcMain.handle('window.control', (_event, action: 'minimize' | 'toggleMaximize' | 'close') => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (win != null) {
      if (action === 'minimize') win.minimize()
      else if (action === 'toggleMaximize') (win.isMaximized() ? win.unmaximize() : win.maximize())
      else win.close()
    }
    return envelope(Promise.resolve(null))
  })
  ipcMain.handle('window.isMaximized', (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    return envelope(Promise.resolve(win?.isMaximized() ?? false))
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    // 无边框：原生标题栏/默认菜单一并去除，控制键由渲染层自绘（window.control 窄桥，D17）
    frame: false,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: `${app.getAppPath()}/build/preload.cjs`,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const rendererUrl = () => process.env.TAGHIT_RENDERER_URL ?? 'http://localhost:5173'
  // 渲染层控制台转发：warning 以上打到主进程 stdout（渲染层早崩/黑屏的唯一诊断窗口）
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer] ${message} (${sourceId}:${line})`)
  })
  // 渲染进程崩溃自恢复（黑屏 = 渲染层死亡露出窗口底色）：记日志并重载，连崩则停手
  let reloads = 0
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[host] 渲染进程退出：reason=${details.reason} exitCode=${details.exitCode}`)
    if (details.reason === 'clean-exit') return
    if (reloads >= 3) {
      console.error('[host] 渲染进程连续崩溃，停止自动重载')
      return
    }
    reloads++
    setTimeout(() => {
      if (!win.isDestroyed()) void win.loadURL(rendererUrl()).catch((e) => console.error('[host] 重载失败', e))
    }, 1000)
  })
  void win.loadURL(rendererUrl())
}

// 字节闸门（媒体侧）：taghit-file:// 特权 scheme 必须在 ready 前注册
registerPrivilegedSchemes()

registerHandlers()

app.whenReady().then(() => {
  // 去掉 Electron 默认应用菜单（File/Edit/View…）；快捷键随菜单一并失效
  Menu.setApplicationMenu(null)
  registerTaghitFileProtocol(services)
  createWindow()
  app.on('activate', () => createWindow())
})

app.on('window-all-closed', () => app.quit())
