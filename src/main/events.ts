import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import type { EVENT_CHANNELS } from '@shared/ipc'

/**
 * AppEventBus —— 主进程内部事件总线 + 向渲染进程广播。
 * 扫描进度、AI 结果等后台事件经由此处推送到所有窗口（webContents.send）。
 */
export class AppEventBus extends EventEmitter {
  private static instance: AppEventBus | null = null

  static get(): AppEventBus {
    if (!AppEventBus.instance) {
      AppEventBus.instance = new AppEventBus()
    }
    return AppEventBus.instance
  }

  /** 向所有窗口广播一个事件（channel 必须是 EVENT_CHANNELS 之一） */
  broadcast(channel: (typeof EVENT_CHANNELS)[number], payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    }
    this.emit(channel, payload)
  }
}
