import { BrowserWindow, dialog } from 'electron'
import { IPC } from '@shared/ipc'
import { handle } from './util'

export function registerDialogIpc(): void {
  handle<undefined, string | null>(IPC.dialog.pickFolder, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const options = { properties: ['openDirectory' as const] }
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  handle<undefined, string | null>(IPC.dialog.pickImage, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      title: '选择封面图片',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'] }
      ]
    }
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  handle<{ title?: string; message: string }, boolean>(IPC.dialog.confirm, async (args) => {
    const win = BrowserWindow.getFocusedWindow()
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      title: args.title ?? '确认',
      message: args.message,
      buttons: ['取消', '确定'],
      // 默认焦点在"取消"：回车/Esc 均不触发删除等破坏性操作
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }
    const res = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    return res.response === 1
  })
}
