import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import type { EVENT_CHANNELS } from '@shared/ipc'

/**
 * 领域事件表 —— service 写操作/后台流程触发（RFC §7.6）。
 * P0.5：事件源在 service（注入 emit 回调），回调先接日志；
 * P1：同一 emit 回调串联 AppEventBus.broadcast（→ 渲染层）与 PluginHost.dispatchDomainEvent（→ 插件）。
 */
export type DomainEventName =
  | 'scan:progress'
  | 'scan:completed'
  | 'item:created'
  | 'item:tagsChanged'
  | 'tag:created'
  | 'tag:deleted'
  | 'tag:declared'
  | 'tag:undeclared'
  | 'workspace:created'
  | 'workspace:deleted'
  | 'workspace:pathAdded'
  | 'workspace:pathRemoved'
  | 'config:changed'

/** service 构造函数注入的事件回调（显式依赖，可单测；RFC §5.5） */
export type EmitFn = (event: DomainEventName, payload: unknown) => void

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
