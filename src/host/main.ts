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
import { searchTags, tagItem, untagItem } from '../application/index.ts'
import type { AppServices } from '../application/index.ts'
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

function registerHandlers(): void {
  ipcMain.handle('ping', () => envelope(Promise.resolve({ version: '0.2.1' })))
  ipcMain.handle('items.query', (_event, query: ItemsQuery) =>
    envelope(services.store.queryItems(query))
  )
  ipcMain.handle('tags.search', (_event, text: string) => envelope(searchTags(services, text)))
  ipcMain.handle('item.tag', (_event, input: { itemId: string; tagIds: string[] }) =>
    envelope(tagItem(services, input.itemId, input.tagIds).then(() => null))
  )
  ipcMain.handle('item.untag', (_event, input: { itemId: string; tagIds: string[] }) =>
    envelope(untagItem(services, input.itemId, input.tagIds).then(() => null))
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
